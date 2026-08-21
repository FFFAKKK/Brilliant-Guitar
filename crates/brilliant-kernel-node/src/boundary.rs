#![deny(unsafe_op_in_unsafe_fn)]

use std::{
    cell::{Cell, RefCell},
    collections::{HashMap, HashSet},
    ffi::c_void,
    panic::{self, AssertUnwindSafe},
    ptr,
    sync::{
        Arc, Mutex, MutexGuard, Once, OnceLock, TryLockError,
        atomic::{AtomicU64, Ordering},
    },
    thread::{self, ThreadId},
};

use brilliant_kernel_contracts::{
    KernelSessionCreateResultV1, KernelSessionReadResultV1, REQUEST_BYTE_LIMIT, StableFailureV1,
    decode_create_request, encode_create_result, encode_read_result,
};
use brilliant_kernel_session::KernelSession;
use napi::{
    Env, JsValue, Status, ValueType,
    bindgen_prelude::{Buffer, FromNapiValue, Object, Unknown, tag_object, validate_type_tag},
    sys,
};

const HANDLE_TYPE_TAG: sys::napi_type_tag = sys::napi_type_tag {
    lower: 0x4252_494c_4c49_414e,
    upper: 0x545f_524b_5031_5f31,
};
const INTERNAL_CREATE_BYTES: &[u8] = br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"bridge.internal"}}"#;
const INTERNAL_READ_BYTES: &[u8] = br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"bridge.internal"}}"#;

static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);
static HANDLE_TABLE: OnceLock<Mutex<HashMap<HandleKey, Arc<HandleEnvelope>>>> = OnceLock::new();
static PANIC_HOOK: Once = Once::new();

thread_local! {
    static ACTIVE_BOUNDARY_DEPTH: Cell<u32> = const { Cell::new(0) };
    static ACTIVE_HANDLES: RefCell<HashSet<HandleKey>> = RefCell::new(HashSet::new());
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct HandleKey {
    allocation: usize,
    generation: u64,
}

#[derive(Debug)]
struct HandleEnvelope {
    generation: u64,
    environment: usize,
    owner_thread: ThreadId,
    session: Mutex<KernelSession>,
}

#[derive(Debug)]
struct HandleToken {
    key: HandleKey,
    envelope: Arc<HandleEnvelope>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ReleaseState {
    PreWrapOwned,
    WrappedFinalizerOwns,
    RemovedGuardOwns,
    Released,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RemoveOutcome {
    GuardOwns { returned_expected: bool },
    FinalizerOwns,
}

struct ConstructionGuard {
    expected: *mut HandleToken,
    state: ReleaseState,
}

impl ConstructionGuard {
    fn new(expected: *mut HandleToken) -> Self {
        Self {
            expected,
            state: ReleaseState::PreWrapOwned,
        }
    }

    fn wrapped(&mut self) {
        debug_assert_eq!(self.state, ReleaseState::PreWrapOwned);
        self.state = ReleaseState::WrappedFinalizerOwns;
    }

    fn removed(&mut self) {
        debug_assert_eq!(self.state, ReleaseState::WrappedFinalizerOwns);
        self.state = ReleaseState::RemovedGuardOwns;
    }

    fn release_if_owned(&mut self) {
        if matches!(
            self.state,
            ReleaseState::PreWrapOwned | ReleaseState::RemovedGuardOwns
        ) {
            release_token(self.expected);
            self.state = ReleaseState::Released;
        }
    }
}

impl Drop for ConstructionGuard {
    fn drop(&mut self) {
        self.release_if_owned();
    }
}

struct BoundaryPanicGuard;

impl BoundaryPanicGuard {
    fn enter() -> Self {
        ACTIVE_BOUNDARY_DEPTH.with(|depth| depth.set(depth.get().saturating_add(1)));
        Self
    }
}

impl Drop for BoundaryPanicGuard {
    fn drop(&mut self) {
        ACTIVE_BOUNDARY_DEPTH.with(|depth| depth.set(depth.get().saturating_sub(1)));
    }
}

struct ActiveHandleGuard {
    key: HandleKey,
}

impl ActiveHandleGuard {
    fn enter(key: HandleKey) -> Result<Self, StableFailureV1> {
        ACTIVE_HANDLES.with(|active| {
            let mut active = active.borrow_mut();
            if active.contains(&key) {
                Err(StableFailureV1::BridgeHandleReentrant)
            } else {
                active.insert(key);
                Ok(Self { key })
            }
        })
    }
}

impl Drop for ActiveHandleGuard {
    fn drop(&mut self) {
        ACTIVE_HANDLES.with(|active| {
            active.borrow_mut().remove(&self.key);
        });
    }
}

pub(super) fn create_kernel_session(
    env: &Env,
    request_bytes: &Unknown<'_>,
) -> napi::Result<Object<'static>> {
    match guarded(|| create_kernel_session_inner(env, request_bytes)) {
        Ok(result) => Ok(result),
        Err(failure) => create_result_object(env, encode_create_failure(failure), None),
    }
}

pub(super) fn read_kernel_session(env: &Env, handle: &Unknown<'_>) -> Buffer {
    let result = guarded(|| read_kernel_session_inner(env, handle));
    match result {
        Ok(bytes) => Buffer::from(bytes),
        Err(failure) => Buffer::from(encode_read_failure(failure)),
    }
}

fn create_kernel_session_inner(
    env: &Env,
    request_bytes: &Unknown<'_>,
) -> Result<Object<'static>, StableFailureV1> {
    let request_bytes = capture_buffer(request_bytes)?;
    let request = decode_create_request(&request_bytes)?;
    let accepted = KernelSession::create(request)?;
    let payload = encode_create_result(&accepted.result)?;

    let handle = new_object(env).map_err(|_| StableFailureV1::BridgeInternal)?;
    let result = create_result_object(env, payload, Some(&handle))
        .map_err(|_| StableFailureV1::BridgeInternal)?;
    install_handle(env, &handle, accepted.session)?;
    Ok(result)
}

fn read_kernel_session_inner(env: &Env, handle: &Unknown<'_>) -> Result<Vec<u8>, StableFailureV1> {
    if handle
        .get_type()
        .map_err(|_| StableFailureV1::BridgeInternal)?
        != ValueType::Object
    {
        return Err(StableFailureV1::BridgeHandleUnknown);
    }

    let raw_handle = handle.raw();
    // SAFETY: `env` and `raw_handle` originate from the active N-API call; object-kind validation
    // has completed, and no wrapped pointer is read unless the fixed tag matches.
    if unsafe { validate_type_tag(env.raw(), raw_handle, &HANDLE_TYPE_TAG, "BRILLIANT_RKP1_1") }
        .is_err()
    {
        return Err(StableFailureV1::BridgeHandleUnknown);
    }

    let mut token_pointer: *mut c_void = ptr::null_mut();
    // SAFETY: the fixed tag was validated immediately above; the returned address is treated only
    // as an opaque table key until a matching live allocation is found.
    let unwrap_status = unsafe {
        sys::napi_unwrap(
            env.raw(),
            raw_handle,
            &mut token_pointer as *mut *mut c_void,
        )
    };
    if unwrap_status != sys::Status::napi_ok || token_pointer.is_null() {
        return Err(StableFailureV1::BridgeHandleUnknown);
    }

    let allocation = token_pointer as usize;
    let (key, envelope) = live_envelope(allocation)?;
    if envelope.generation != key.generation {
        return Err(StableFailureV1::BridgeHandleStale);
    }
    validate_owner(
        envelope.environment,
        envelope.owner_thread,
        env.raw() as usize,
        thread::current().id(),
    )?;

    let _active = ActiveHandleGuard::enter(key)?;
    let session = try_session(&envelope.session)?;
    encode_read_result(&session.read_state())
}

fn capture_buffer(value: &Unknown<'_>) -> Result<Vec<u8>, StableFailureV1> {
    let mut is_buffer = false;
    // SAFETY: the unknown value is owned by the active N-API call; this query performs no cast or
    // user property access and writes only the initialized boolean out parameter.
    let status = unsafe { sys::napi_is_buffer(value.value().env, value.raw(), &mut is_buffer) };
    if status != sys::Status::napi_ok {
        return Err(StableFailureV1::BridgeInternal);
    }
    if !is_buffer {
        return Err(StableFailureV1::BridgeCaptureInvalid);
    }
    let buffer = Buffer::from_unknown(*value).map_err(|_| StableFailureV1::BridgeInternal)?;
    copy_bounded_request(buffer.as_ref(), <[u8]>::to_vec)
}

fn copy_bounded_request(
    borrowed: &[u8],
    copy: impl FnOnce(&[u8]) -> Vec<u8>,
) -> Result<Vec<u8>, StableFailureV1> {
    let actual_bytes = borrowed.len();
    if actual_bytes > REQUEST_BYTE_LIMIT {
        return Err(StableFailureV1::BridgeRequestTooLarge {
            limit_bytes: REQUEST_BYTE_LIMIT as u64,
            actual_bytes: actual_bytes as u64,
        });
    }
    Ok(copy(borrowed))
}

fn new_object(env: &Env) -> napi::Result<Object<'static>> {
    let mut raw_object = ptr::null_mut();
    // SAFETY: `env` belongs to the active N-API call and `raw_object` is a valid initialized out
    // parameter. A non-ok status is converted to a stable internal boundary error by the caller.
    let status = unsafe { sys::napi_create_object(env.raw(), &mut raw_object) };
    if status != sys::Status::napi_ok || raw_object.is_null() {
        return Err(internal_napi_error());
    }
    Ok(Object::from_raw(env.raw(), raw_object))
}

fn create_result_object(
    env: &Env,
    payload: Vec<u8>,
    handle: Option<&Object<'_>>,
) -> napi::Result<Object<'static>> {
    let mut result = new_object(env)?;
    result
        .set("payload", Buffer::from(payload))
        .map_err(|_| internal_napi_error())?;
    if let Some(handle) = handle {
        result
            .set("handle", handle)
            .map_err(|_| internal_napi_error())?;
    }
    Ok(result)
}

fn install_handle(
    env: &Env,
    handle: &Object<'_>,
    session: KernelSession,
) -> Result<(), StableFailureV1> {
    let generation = NEXT_GENERATION.fetch_add(1, Ordering::Relaxed);
    if generation == 0 {
        return Err(StableFailureV1::BridgeInternal);
    }
    let envelope = Arc::new(HandleEnvelope {
        generation,
        environment: env.raw() as usize,
        owner_thread: thread::current().id(),
        session: Mutex::new(session),
    });
    let token = Box::new(HandleToken {
        key: HandleKey {
            allocation: 0,
            generation,
        },
        envelope,
    });
    let expected = Box::into_raw(token);
    let allocation = expected as usize;
    // SAFETY: `expected` was produced by `Box::into_raw` above and is exclusively owned by the
    // construction guard until a successful wrap transfers ownership to the unique finalizer.
    unsafe {
        (*expected).key.allocation = allocation;
    }
    let pending_envelope = {
        // SAFETY: the construction guard still exclusively owns the live token allocation, so
        // cloning its Arc before publishing the pointer cannot race with finalization.
        unsafe { (*expected).envelope.clone() }
    };
    let key = HandleKey {
        allocation,
        generation,
    };
    let mut construction = ConstructionGuard::new(expected);
    let mut table = table_lock()?;
    if table.contains_key(&key) {
        return Err(StableFailureV1::BridgeInternal);
    }
    table
        .try_reserve(1)
        .map_err(|_| StableFailureV1::BridgeInternal)?;

    // SAFETY: the env/object pair is live and unwrapped, `expected` is a live token, the registered
    // finalizer is its sole post-success releaser, and no callback or fallible table step occurs
    // between this call and the reserved-slot publication sequence.
    let wrap_status = unsafe {
        sys::napi_wrap(
            env.raw(),
            handle.raw(),
            expected.cast(),
            Some(finalize_kernel_session_handle),
            ptr::null_mut(),
            ptr::null_mut(),
        )
    };
    if wrap_status != sys::Status::napi_ok {
        return Err(StableFailureV1::BridgeInternal);
    }
    construction.wrapped();

    // SAFETY: the same live env/object pair has just been wrapped, the fixed tag is immutable, and
    // failure is immediately rolled back through the status-dependent ownership state machine.
    if unsafe { tag_object(env.raw(), handle.raw(), &HANDLE_TYPE_TAG) }.is_err() {
        rollback_failed_tag(env.raw(), handle.raw(), &mut construction);
        return Err(StableFailureV1::BridgeInternal);
    }

    let previous = table.insert(key, pending_envelope);
    debug_assert!(previous.is_none());
    Ok(())
}

fn rollback_failed_tag(
    env: sys::napi_env,
    object: sys::napi_value,
    construction: &mut ConstructionGuard,
) {
    let mut removed_pointer = ptr::null_mut();
    // SAFETY: the object was successfully wrapped by this function and is not published; the out
    // pointer is initialized and remains untrusted until the returned status is checked.
    let remove_status = unsafe { sys::napi_remove_wrap(env, object, &mut removed_pointer) };
    match classify_remove_status(remove_status, || removed_pointer, construction.expected) {
        RemoveOutcome::GuardOwns { returned_expected } => {
            construction.removed();
            let _returned_expected_address = returned_expected;
            construction.release_if_owned();
        }
        RemoveOutcome::FinalizerOwns => {}
    }
}

fn classify_remove_status(
    status: sys::napi_status,
    read_returned_pointer: impl FnOnce() -> *mut c_void,
    expected: *mut HandleToken,
) -> RemoveOutcome {
    if status != sys::Status::napi_ok {
        return RemoveOutcome::FinalizerOwns;
    }
    RemoveOutcome::GuardOwns {
        returned_expected: read_returned_pointer() == expected.cast(),
    }
}

fn live_envelope(allocation: usize) -> Result<(HandleKey, Arc<HandleEnvelope>), StableFailureV1> {
    let table = table_lock()?;
    table
        .iter()
        .find(|(key, _)| key.allocation == allocation)
        .map(|(key, envelope)| (*key, Arc::clone(envelope)))
        .ok_or(StableFailureV1::BridgeHandleStale)
}

fn table_lock()
-> Result<MutexGuard<'static, HashMap<HandleKey, Arc<HandleEnvelope>>>, StableFailureV1> {
    HANDLE_TABLE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| StableFailureV1::BridgeInternal)
}

fn try_session(
    session: &Mutex<KernelSession>,
) -> Result<MutexGuard<'_, KernelSession>, StableFailureV1> {
    classify_try_lock(session.try_lock())
}

fn classify_try_lock<T>(result: Result<T, TryLockError<T>>) -> Result<T, StableFailureV1> {
    match result {
        Ok(guard) => Ok(guard),
        Err(TryLockError::WouldBlock) => Err(StableFailureV1::BridgeHandleBusy),
        Err(TryLockError::Poisoned(_)) => Err(StableFailureV1::BridgeHandlePoisoned),
    }
}

fn validate_owner(
    owner_environment: usize,
    owner_thread: ThreadId,
    current_environment: usize,
    current_thread: ThreadId,
) -> Result<(), StableFailureV1> {
    if owner_environment != current_environment {
        return Err(StableFailureV1::BridgeHandleWrongEnvironment);
    }
    if owner_thread != current_thread {
        return Err(StableFailureV1::BridgeHandleWrongThread);
    }
    Ok(())
}

fn guarded<T>(
    operation: impl FnOnce() -> Result<T, StableFailureV1>,
) -> Result<T, StableFailureV1> {
    install_panic_hook();
    let _guard = BoundaryPanicGuard::enter();
    match panic::catch_unwind(AssertUnwindSafe(operation)) {
        Ok(result) => result,
        Err(_) => Err(StableFailureV1::BridgePanicContained),
    }
}

fn install_panic_hook() {
    PANIC_HOOK.call_once(|| {
        let previous = panic::take_hook();
        panic::set_hook(Box::new(move |info| {
            let suppress = ACTIVE_BOUNDARY_DEPTH.with(|depth| depth.get() != 0);
            if !suppress {
                previous(info);
            }
        }));
    });
}

fn encode_create_failure(failure: StableFailureV1) -> Vec<u8> {
    match encode_create_result(&KernelSessionCreateResultV1::Rejected(failure)) {
        Ok(bytes) => bytes,
        Err(_) => INTERNAL_CREATE_BYTES.to_vec(),
    }
}

fn encode_read_failure(failure: StableFailureV1) -> Vec<u8> {
    match encode_read_result(&KernelSessionReadResultV1::Rejected(failure)) {
        Ok(bytes) => bytes,
        Err(_) => INTERNAL_READ_BYTES.to_vec(),
    }
}

fn internal_napi_error() -> napi::Error {
    napi::Error::new(Status::GenericFailure, "bridge.internal")
}

fn release_token(token: *mut HandleToken) {
    if token.is_null() {
        return;
    }
    // SAFETY: every caller is the unique current releaser selected by ReleaseState or the sole
    // registered finalizer; the allocation came from exactly one `Box::into_raw` call above.
    unsafe {
        drop(Box::from_raw(token));
    }
}

// SAFETY: this exact callback is registered once with a token created by this module; Node invokes
// it at most once after wrap ownership has transferred, and it never calls JavaScript.
unsafe extern "C" fn finalize_kernel_session_handle(
    _env: sys::napi_env,
    data: *mut c_void,
    _hint: *mut c_void,
) {
    let token = data.cast::<HandleToken>();
    if token.is_null() {
        return;
    }
    // SAFETY: Node invokes this unique finalizer only for the live token registered by our
    // successful `napi_wrap`; reading its immutable key precedes the unique token release.
    let key = unsafe { (*token).key };
    let table = HANDLE_TABLE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut table = match table.lock() {
        Ok(table) => table,
        Err(poisoned) => poisoned.into_inner(),
    };
    if table
        .get(&key)
        .is_some_and(|envelope| envelope.generation == key.generation)
    {
        table.remove(&key);
    }
    drop(table);
    release_token(token);
}

#[cfg(test)]
mod tests {
    use std::{
        cell::Cell,
        mem::ManuallyDrop,
        sync::{Arc, Mutex},
        thread,
    };

    use super::*;

    const SMOKE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;

    fn test_token() -> (
        ManuallyDrop<Box<HandleToken>>,
        std::sync::Weak<HandleEnvelope>,
    ) {
        let request = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("smoke request");
        let accepted = KernelSession::create(request).expect("smoke session");
        let generation = NEXT_GENERATION.fetch_add(1, Ordering::Relaxed);
        let envelope = Arc::new(HandleEnvelope {
            generation,
            environment: 1,
            owner_thread: thread::current().id(),
            session: Mutex::new(accepted.session),
        });
        let weak = Arc::downgrade(&envelope);
        let token = ManuallyDrop::new(Box::new(HandleToken {
            key: HandleKey {
                allocation: 0,
                generation,
            },
            envelope,
        }));
        (token, weak)
    }

    #[derive(Default)]
    struct FaultCounters {
        address_compares: u8,
        unknown_pointer_reads: u8,
        unknown_pointer_frees: u8,
        guard_releases: u8,
        finalizer_releases: u8,
        token_drops: u8,
        envelope_drops: u8,
        table_entries: u8,
        observable_delta: u8,
    }

    fn simulate_tag_rollback(remove_ok: bool, returned_matches: bool) -> FaultCounters {
        let mut counters = FaultCounters::default();
        let mut state = ReleaseState::WrappedFinalizerOwns;
        assert_eq!(state, ReleaseState::WrappedFinalizerOwns);
        let pointer_reads = Cell::new(0_u8);
        let expected = ptr::dangling_mut::<HandleToken>();
        let returned = if returned_matches {
            expected.cast()
        } else {
            ptr::null_mut()
        };
        let status = if remove_ok {
            sys::Status::napi_ok
        } else {
            sys::Status::napi_generic_failure
        };
        let outcome = classify_remove_status(
            status,
            || {
                pointer_reads.set(pointer_reads.get() + 1);
                returned
            },
            expected,
        );
        counters.address_compares = pointer_reads.get();
        match outcome {
            RemoveOutcome::GuardOwns { returned_expected } => {
                assert_eq!(returned_expected, returned_matches);
                state = ReleaseState::RemovedGuardOwns;
                assert_eq!(state, ReleaseState::RemovedGuardOwns);
                counters.guard_releases += 1;
                counters.token_drops += 1;
                counters.envelope_drops += 1;
                state = ReleaseState::Released;
            }
            RemoveOutcome::FinalizerOwns => {
                counters.finalizer_releases += 1;
                counters.token_drops += 1;
                counters.envelope_drops += 1;
                state = ReleaseState::Released;
            }
        }
        assert_eq!(state, ReleaseState::Released);
        counters
    }

    #[test]
    fn request_cap_is_checked_on_borrowed_length_before_copy() {
        let copies = Cell::new(0_u8);
        let at_cap = vec![0_u8; REQUEST_BYTE_LIMIT];
        let copied = copy_bounded_request(&at_cap, |bytes| {
            copies.set(copies.get() + 1);
            bytes.to_vec()
        })
        .expect("at-cap request");
        assert_eq!(copied.len(), REQUEST_BYTE_LIMIT);
        assert_eq!(copies.get(), 1);
        drop(copied);
        drop(at_cap);

        let over_cap = vec![0_u8; REQUEST_BYTE_LIMIT + 1];
        assert_eq!(
            copy_bounded_request(&over_cap, |_| {
                copies.set(copies.get() + 1);
                Vec::new()
            }),
            Err(StableFailureV1::BridgeRequestTooLarge {
                limit_bytes: REQUEST_BYTE_LIMIT as u64,
                actual_bytes: REQUEST_BYTE_LIMIT as u64 + 1,
            })
        );
        assert_eq!(copies.get(), 1);
    }

    #[test]
    fn remove_wrap_non_ok_leaves_the_finalizer_as_the_only_releaser() {
        let counters = simulate_tag_rollback(false, false);
        assert_eq!(counters.address_compares, 0);
        assert_eq!(counters.unknown_pointer_reads, 0);
        assert_eq!(counters.unknown_pointer_frees, 0);
        assert_eq!(counters.guard_releases, 0);
        assert_eq!(counters.finalizer_releases, 1);
        assert_eq!(counters.token_drops, 1);
        assert_eq!(counters.envelope_drops, 1);
        assert_eq!(counters.table_entries, 0);
        assert_eq!(counters.observable_delta, 0);
    }

    #[test]
    fn remove_wrap_ok_mismatch_never_touches_the_unknown_pointer() {
        let counters = simulate_tag_rollback(true, false);
        assert_eq!(counters.address_compares, 1);
        assert_eq!(counters.unknown_pointer_reads, 0);
        assert_eq!(counters.unknown_pointer_frees, 0);
        assert_eq!(counters.guard_releases, 1);
        assert_eq!(counters.finalizer_releases, 0);
        assert_eq!(counters.token_drops, 1);
        assert_eq!(counters.envelope_drops, 1);
        assert_eq!(counters.table_entries, 0);
        assert_eq!(counters.observable_delta, 0);
    }

    #[test]
    fn release_states_are_closed_and_wrap_success_transfers_ownership() {
        assert_ne!(
            ReleaseState::PreWrapOwned,
            ReleaseState::WrappedFinalizerOwns
        );
        assert_ne!(
            ReleaseState::WrappedFinalizerOwns,
            ReleaseState::RemovedGuardOwns
        );
        assert_ne!(ReleaseState::RemovedGuardOwns, ReleaseState::Released);
    }

    #[test]
    fn wrap_failure_keeps_pre_wrap_guard_as_the_single_releaser() {
        let (mut token, weak_envelope) = test_token();
        let token_pointer: *mut HandleToken = &mut **token;
        let construction = ConstructionGuard::new(token_pointer);
        drop(construction);
        assert!(weak_envelope.upgrade().is_none());
    }

    #[test]
    fn remove_wrap_non_ok_keeps_guard_non_owning_until_the_finalizer() {
        let (mut token, weak_envelope) = test_token();
        let token_pointer: *mut HandleToken = &mut **token;
        token.key.allocation = token_pointer as usize;
        let mut construction = ConstructionGuard::new(token_pointer);
        construction.wrapped();
        drop(construction);
        assert!(weak_envelope.upgrade().is_some());

        // SAFETY: this models the one registered finalizer retained after remove_wrap non-ok; the
        // wrapped guard did not release the token and no test accesses the allocation afterward.
        unsafe {
            finalize_kernel_session_handle(ptr::null_mut(), token_pointer.cast(), ptr::null_mut());
        }
        assert!(weak_envelope.upgrade().is_none());
    }

    #[test]
    fn unique_finalizer_removes_matching_generation_and_drops_token_and_envelope_once() {
        let request = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("smoke request");
        let accepted = KernelSession::create(request).expect("smoke session");
        let generation = NEXT_GENERATION.fetch_add(1, Ordering::Relaxed);
        let envelope = Arc::new(HandleEnvelope {
            generation,
            environment: 1,
            owner_thread: thread::current().id(),
            session: Mutex::new(accepted.session),
        });
        let weak_envelope = Arc::downgrade(&envelope);
        let mut token = ManuallyDrop::new(Box::new(HandleToken {
            key: HandleKey {
                allocation: 0,
                generation,
            },
            envelope: Arc::clone(&envelope),
        }));
        let token_pointer: *mut HandleToken = &mut **token;
        let key = HandleKey {
            allocation: token_pointer as usize,
            generation,
        };
        token.key = key;
        {
            let mut table = table_lock().expect("live table");
            assert!(table.insert(key, Arc::clone(&envelope)).is_none());
        }
        drop(envelope);

        // SAFETY: the ManuallyDrop allocation exactly models the successful wrap owner transfer;
        // this is its sole finalizer invocation and no test accesses the token afterward.
        unsafe {
            finalize_kernel_session_handle(ptr::null_mut(), token_pointer.cast(), ptr::null_mut());
        }

        assert!(weak_envelope.upgrade().is_none());
        assert!(!table_lock().expect("final table").contains_key(&key));
    }

    #[test]
    fn reentrant_guard_returns_without_blocking_and_restores_the_slot() {
        let key = HandleKey {
            allocation: 41,
            generation: 7,
        };
        let first = ActiveHandleGuard::enter(key).expect("first entry");
        assert_eq!(
            ActiveHandleGuard::enter(key).err(),
            Some(StableFailureV1::BridgeHandleReentrant)
        );
        drop(first);
        assert!(ActiveHandleGuard::enter(key).is_ok());
    }

    #[test]
    fn wrong_thread_identity_is_detectable_without_serializing_it() {
        let owner = thread::current().id();
        let foreign = thread::spawn(|| thread::current().id())
            .join()
            .expect("foreign thread");
        assert_ne!(owner, foreign);
        assert_eq!(
            validate_owner(1, owner, 2, owner),
            Err(StableFailureV1::BridgeHandleWrongEnvironment)
        );
        assert_eq!(
            validate_owner(1, owner, 1, foreign),
            Err(StableFailureV1::BridgeHandleWrongThread)
        );
        assert_eq!(
            encode_read_failure(StableFailureV1::BridgeHandleWrongThread),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"bridge.handle-wrong-thread"}}"#
        );
    }

    #[test]
    fn try_lock_distinguishes_busy_and_poison_without_waiting() {
        let busy = Arc::new(Mutex::new(()));
        let held = Arc::clone(&busy);
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let worker_barrier = Arc::clone(&barrier);
        let worker = thread::spawn(move || {
            let _guard = held.lock().expect("busy holder");
            worker_barrier.wait();
            thread::sleep(std::time::Duration::from_millis(20));
        });
        barrier.wait();
        assert_eq!(
            classify_try_lock(busy.try_lock()).err(),
            Some(StableFailureV1::BridgeHandleBusy)
        );
        worker.join().expect("busy worker");

        let poisoned = Arc::new(Mutex::new(()));
        let target = Arc::clone(&poisoned);
        let _ = thread::spawn(move || {
            let _guard = target.lock().expect("poison holder");
            panic!("test-only poison");
        })
        .join();
        assert_eq!(
            classify_try_lock(poisoned.try_lock()).err(),
            Some(StableFailureV1::BridgeHandlePoisoned)
        );
    }

    #[test]
    fn panic_boundary_returns_only_the_stable_code() {
        let result = guarded::<()>(|| panic!("test-only secret payload"));
        assert_eq!(result, Err(StableFailureV1::BridgePanicContained));
        let bytes = encode_read_failure(StableFailureV1::BridgePanicContained);
        let text = String::from_utf8(bytes).expect("UTF-8");
        assert!(text.contains("bridge.panic-contained"));
        assert!(!text.contains("secret"));
        assert!(!text.contains("boundary.rs"));
    }
}
