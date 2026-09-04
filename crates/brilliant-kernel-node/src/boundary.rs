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
    KernelSessionCreateResultV1, KernelSessionReadResultV1, KernelStage3MetricsV1,
    KernelStage3SubmitResultV1, KernelStage4CommandResultV1, KernelStage4OperationResultV1,
    REQUEST_BYTE_LIMIT, StableFailureV1, decode_create_request, encode_create_result,
    encode_read_result, encode_stage3_submit_result, encode_stage4_operation_result,
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
const INTERNAL_SUBMIT_BYTES: &[u8] = br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"bridge.internal"}}"#;
const INTERNAL_STAGE4_BYTES: &[u8] = br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"bridge.internal"}}"#;
// Only this decimal field's width feeds back into the encoded length. Under the 64 MiB response
// cap, starting from zero stabilizes in at most three encodes; the fourth step is a closed guard.
const FFI_RESPONSE_LENGTH_FIXPOINT_STEPS: usize = 4;

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
    drop_probe: Option<Arc<DropProbe>>,
}

#[derive(Debug)]
struct HandleToken {
    key: HandleKey,
    envelope: Arc<HandleEnvelope>,
    drop_probe: Option<Arc<DropProbe>>,
}

#[derive(Debug, Default)]
struct DropProbe {
    token_drops: std::sync::atomic::AtomicUsize,
    envelope_drops: std::sync::atomic::AtomicUsize,
}

impl Drop for HandleToken {
    fn drop(&mut self) {
        if let Some(probe) = &self.drop_probe {
            probe.token_drops.fetch_add(1, Ordering::Relaxed);
        }
    }
}

impl Drop for HandleEnvelope {
    fn drop(&mut self) {
        if let Some(probe) = &self.drop_probe {
            probe.envelope_drops.fetch_add(1, Ordering::Relaxed);
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ReleaseState {
    PreWrapOwned,
    WrappedFinalizerOwns,
    RemovedGuardOwns,
    Released,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct RollbackObservation {
    owner: ReleaseState,
    out_pointer_compared: bool,
    returned_expected: Option<bool>,
}

trait RemoveWrapOps {
    fn remove_wrap(&mut self, returned: &mut *mut c_void) -> sys::napi_status;
}

struct NativeRemoveWrapOps {
    env: sys::napi_env,
    object: sys::napi_value,
}

impl RemoveWrapOps for NativeRemoveWrapOps {
    fn remove_wrap(&mut self, returned: &mut *mut c_void) -> sys::napi_status {
        // SAFETY: the object was successfully wrapped by this module and is not published; the out
        // pointer is initialized and remains untrusted until the returned status is checked.
        unsafe { sys::napi_remove_wrap(self.env, self.object, returned) }
    }
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

pub(super) fn submit_kernel_stage3(
    env: &Env,
    handle: &Unknown<'_>,
    request_bytes: &Unknown<'_>,
) -> Buffer {
    let result = guarded(|| submit_kernel_stage3_inner(env, handle, request_bytes));
    match result {
        Ok(bytes) => Buffer::from(bytes),
        Err(failure) => Buffer::from(encode_submit_failure(failure)),
    }
}

pub(super) fn operate_kernel_stage4(
    env: &Env,
    handle: &Unknown<'_>,
    request_bytes: &Unknown<'_>,
) -> Buffer {
    let result = guarded(|| operate_kernel_stage4_inner(env, handle, request_bytes));
    match result {
        Ok(bytes) => Buffer::from(bytes),
        Err(failure) => Buffer::from(encode_stage4_failure(failure)),
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
    with_session(env, handle, |session| {
        encode_read_result(&session.read_state())
    })
}

fn submit_kernel_stage3_inner(
    env: &Env,
    handle: &Unknown<'_>,
    request_bytes: &Unknown<'_>,
) -> Result<Vec<u8>, StableFailureV1> {
    let request_bytes = capture_buffer(request_bytes)?;
    let request_byte_count = request_bytes.len();
    let result = with_session(env, handle, |session| {
        Ok(session.submit_stage3_bytes(&request_bytes))
    })?;
    encode_submit_result_with_ffi_metrics(result, request_byte_count)
}

fn operate_kernel_stage4_inner(
    env: &Env,
    handle: &Unknown<'_>,
    request_bytes: &Unknown<'_>,
) -> Result<Vec<u8>, StableFailureV1> {
    let request_bytes = capture_buffer(request_bytes)?;
    let request_byte_count = request_bytes.len();
    let result = with_session(env, handle, |session| {
        Ok(session.operate_stage4_bytes(&request_bytes))
    })?;
    encode_stage4_result_with_ffi_metrics(result, request_byte_count)
}

fn with_session<T>(
    env: &Env,
    handle: &Unknown<'_>,
    operation: impl FnOnce(&mut KernelSession) -> Result<T, StableFailureV1>,
) -> Result<T, StableFailureV1> {
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
    let mut session = try_session(&envelope.session)?;
    operation(&mut session)
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
        drop_probe: None,
    });
    let token = Box::new(HandleToken {
        key: HandleKey {
            allocation: 0,
            generation,
        },
        envelope,
        drop_probe: None,
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
    let mut ops = NativeRemoveWrapOps { env, object };
    let _observation = rollback_failed_tag_with_ops(&mut ops, construction);
}

fn rollback_failed_tag_with_ops(
    ops: &mut impl RemoveWrapOps,
    construction: &mut ConstructionGuard,
) -> RollbackObservation {
    let mut returned_pointer = ptr::null_mut();
    let status = ops.remove_wrap(&mut returned_pointer);
    if status != sys::Status::napi_ok {
        return RollbackObservation {
            owner: ReleaseState::WrappedFinalizerOwns,
            out_pointer_compared: false,
            returned_expected: None,
        };
    }
    let returned_expected = returned_pointer == construction.expected.cast();
    construction.removed();
    construction.release_if_owned();
    RollbackObservation {
        owner: ReleaseState::Released,
        out_pointer_compared: true,
        returned_expected: Some(returned_expected),
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

fn encode_submit_failure(failure: StableFailureV1) -> Vec<u8> {
    match encode_stage3_submit_result(&KernelStage3SubmitResultV1::Rejected(failure)) {
        Ok(bytes) => bytes,
        Err(_) => INTERNAL_SUBMIT_BYTES.to_vec(),
    }
}

fn encode_stage4_failure(failure: StableFailureV1) -> Vec<u8> {
    match encode_stage4_operation_result(&KernelStage4OperationResultV1::Rejected(failure)) {
        Ok(bytes) => bytes,
        Err(_) => INTERNAL_STAGE4_BYTES.to_vec(),
    }
}

fn encode_submit_result_with_ffi_metrics(
    mut result: KernelStage3SubmitResultV1,
    request_bytes: usize,
) -> Result<Vec<u8>, StableFailureV1> {
    let request_bytes =
        u64::try_from(request_bytes).map_err(|_| StableFailureV1::BridgeInternal)?;
    if let Some(metrics) = submit_metrics_mut(&mut result) {
        metrics.ffi_request_bytes = request_bytes;
    }

    let mut expected_response_bytes = 0_u64;
    for _ in 0..FFI_RESPONSE_LENGTH_FIXPOINT_STEPS {
        if let Some(metrics) = submit_metrics_mut(&mut result) {
            metrics.ffi_response_bytes = expected_response_bytes;
        }
        let encoded = encode_stage3_submit_result(&result)?;
        let actual_response_bytes =
            u64::try_from(encoded.len()).map_err(|_| StableFailureV1::BridgeInternal)?;
        if actual_response_bytes == expected_response_bytes
            || submit_metrics_mut(&mut result).is_none()
        {
            return Ok(encoded);
        }
        expected_response_bytes = actual_response_bytes;
    }
    Err(StableFailureV1::BridgeInternal)
}

fn submit_metrics_mut(
    result: &mut KernelStage3SubmitResultV1,
) -> Option<&mut KernelStage3MetricsV1> {
    match result {
        KernelStage3SubmitResultV1::Committed(value) => Some(&mut value.metrics),
        KernelStage3SubmitResultV1::NoOp(value) => Some(&mut value.metrics),
        KernelStage3SubmitResultV1::CommandRejected { value, .. } => Some(&mut value.metrics),
        KernelStage3SubmitResultV1::Rejected(_) => None,
    }
}

fn encode_stage4_result_with_ffi_metrics(
    mut result: KernelStage4OperationResultV1,
    request_bytes: usize,
) -> Result<Vec<u8>, StableFailureV1> {
    let request_bytes =
        u64::try_from(request_bytes).map_err(|_| StableFailureV1::BridgeInternal)?;
    if let Some(metrics) = stage4_stage3_metrics_mut(&mut result) {
        metrics.ffi_request_bytes = request_bytes;
    }

    let mut expected_response_bytes = 0_u64;
    for _ in 0..FFI_RESPONSE_LENGTH_FIXPOINT_STEPS {
        if let Some(metrics) = stage4_stage3_metrics_mut(&mut result) {
            metrics.ffi_response_bytes = expected_response_bytes;
        }
        let encoded = encode_stage4_operation_result(&result)?;
        let actual_response_bytes =
            u64::try_from(encoded.len()).map_err(|_| StableFailureV1::BridgeInternal)?;
        if actual_response_bytes == expected_response_bytes
            || stage4_stage3_metrics_mut(&mut result).is_none()
        {
            return Ok(encoded);
        }
        expected_response_bytes = actual_response_bytes;
    }
    Err(StableFailureV1::BridgeInternal)
}

fn stage4_stage3_metrics_mut(
    result: &mut KernelStage4OperationResultV1,
) -> Option<&mut KernelStage3MetricsV1> {
    match result {
        KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value,
            ..
        })
        | KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::NoOp { value }) => {
            Some(&mut value.metrics)
        }
        KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Rejected {
            value,
            ..
        }) => Some(&mut value.metrics),
        KernelStage4OperationResultV1::MarkPersisted(_)
        | KernelStage4OperationResultV1::Read(_)
        | KernelStage4OperationResultV1::Select(_)
        | KernelStage4OperationResultV1::Rejected(_) => None,
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
        Arc<DropProbe>,
    ) {
        let request = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("smoke request");
        let accepted = KernelSession::create(request).expect("smoke session");
        let generation = NEXT_GENERATION.fetch_add(1, Ordering::Relaxed);
        let probe = Arc::new(DropProbe::default());
        let envelope = Arc::new(HandleEnvelope {
            generation,
            environment: 1,
            owner_thread: thread::current().id(),
            session: Mutex::new(accepted.session),
            drop_probe: Some(Arc::clone(&probe)),
        });
        let weak = Arc::downgrade(&envelope);
        let token = ManuallyDrop::new(Box::new(HandleToken {
            key: HandleKey {
                allocation: 0,
                generation,
            },
            envelope,
            drop_probe: Some(Arc::clone(&probe)),
        }));
        (token, weak, probe)
    }

    struct FakeRemoveWrapOps {
        status: sys::napi_status,
        returned: *mut c_void,
        calls: usize,
    }

    impl RemoveWrapOps for FakeRemoveWrapOps {
        fn remove_wrap(&mut self, returned: &mut *mut c_void) -> sys::napi_status {
            self.calls += 1;
            *returned = self.returned;
            self.status
        }
    }

    #[derive(Clone, Copy)]
    enum ReturnedPointer {
        Expected,
        Null,
        Mismatch,
    }

    fn assert_tag_rollback(status: sys::napi_status, returned: ReturnedPointer) {
        let (mut token, weak_envelope, probe) = test_token();
        let token_pointer: *mut HandleToken = &mut **token;
        token.key.allocation = token_pointer as usize;
        let key = token.key;
        assert!(!table_lock().expect("initial table").contains_key(&key));

        let returned_pointer = match returned {
            ReturnedPointer::Expected => token_pointer.cast(),
            ReturnedPointer::Null => ptr::null_mut(),
            ReturnedPointer::Mismatch => usize::MAX as *mut c_void,
        };
        let mut ops = FakeRemoveWrapOps {
            status,
            returned: returned_pointer,
            calls: 0,
        };
        let mut construction = ConstructionGuard::new(token_pointer);
        construction.wrapped();
        let started = std::time::Instant::now();
        let observation = rollback_failed_tag_with_ops(&mut ops, &mut construction);
        assert!(started.elapsed() < std::time::Duration::from_secs(1));
        assert_eq!(ops.calls, 1);
        assert!(!table_lock().expect("rollback table").contains_key(&key));
        assert_eq!(
            encode_create_failure(StableFailureV1::BridgeInternal),
            INTERNAL_CREATE_BYTES
        );

        if status == sys::Status::napi_ok {
            assert_eq!(observation.owner, ReleaseState::Released);
            assert!(observation.out_pointer_compared);
            assert_eq!(
                observation.returned_expected,
                Some(matches!(returned, ReturnedPointer::Expected))
            );
            assert_eq!(construction.state, ReleaseState::Released);
            assert!(weak_envelope.upgrade().is_none());
            assert_eq!(probe.token_drops.load(Ordering::Relaxed), 1);
            assert_eq!(probe.envelope_drops.load(Ordering::Relaxed), 1);
            drop(construction);
            assert_eq!(probe.token_drops.load(Ordering::Relaxed), 1);
            assert_eq!(probe.envelope_drops.load(Ordering::Relaxed), 1);
        } else {
            assert_eq!(observation.owner, ReleaseState::WrappedFinalizerOwns);
            assert!(!observation.out_pointer_compared);
            assert_eq!(observation.returned_expected, None);
            assert_eq!(construction.state, ReleaseState::WrappedFinalizerOwns);
            assert!(weak_envelope.upgrade().is_some());
            assert_eq!(probe.token_drops.load(Ordering::Relaxed), 0);
            assert_eq!(probe.envelope_drops.load(Ordering::Relaxed), 0);
            drop(construction);
            assert_eq!(probe.token_drops.load(Ordering::Relaxed), 0);
            // SAFETY: non-ok keeps this exact wrapped token owned by its unique finalizer; this
            // invocation is the only releaser and no test accesses the token afterward.
            unsafe {
                finalize_kernel_session_handle(
                    ptr::null_mut(),
                    token_pointer.cast(),
                    ptr::null_mut(),
                );
            }
            assert!(weak_envelope.upgrade().is_none());
            assert_eq!(probe.token_drops.load(Ordering::Relaxed), 1);
            assert_eq!(probe.envelope_drops.load(Ordering::Relaxed), 1);
        }
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
    fn production_rollback_non_ok_leaves_the_finalizer_as_the_only_releaser() {
        assert_tag_rollback(sys::Status::napi_generic_failure, ReturnedPointer::Mismatch);
    }

    #[test]
    fn production_rollback_ok_expected_releases_once() {
        assert_tag_rollback(sys::Status::napi_ok, ReturnedPointer::Expected);
    }

    #[test]
    fn production_rollback_ok_null_releases_expected_once() {
        assert_tag_rollback(sys::Status::napi_ok, ReturnedPointer::Null);
    }

    #[test]
    fn production_rollback_ok_mismatch_never_touches_the_unknown_pointer() {
        assert_tag_rollback(sys::Status::napi_ok, ReturnedPointer::Mismatch);
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
        let (mut token, weak_envelope, probe) = test_token();
        let token_pointer: *mut HandleToken = &mut **token;
        let construction = ConstructionGuard::new(token_pointer);
        drop(construction);
        assert!(weak_envelope.upgrade().is_none());
        assert_eq!(probe.token_drops.load(Ordering::Relaxed), 1);
        assert_eq!(probe.envelope_drops.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn remove_wrap_non_ok_keeps_guard_non_owning_until_the_finalizer() {
        let (mut token, weak_envelope, probe) = test_token();
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
        assert_eq!(probe.token_drops.load(Ordering::Relaxed), 1);
        assert_eq!(probe.envelope_drops.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn unique_finalizer_removes_matching_generation_and_drops_token_and_envelope_once() {
        let request = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("smoke request");
        let accepted = KernelSession::create(request).expect("smoke session");
        let generation = NEXT_GENERATION.fetch_add(1, Ordering::Relaxed);
        let probe = Arc::new(DropProbe::default());
        let envelope = Arc::new(HandleEnvelope {
            generation,
            environment: 1,
            owner_thread: thread::current().id(),
            session: Mutex::new(accepted.session),
            drop_probe: Some(Arc::clone(&probe)),
        });
        let weak_envelope = Arc::downgrade(&envelope);
        let mut token = ManuallyDrop::new(Box::new(HandleToken {
            key: HandleKey {
                allocation: 0,
                generation,
            },
            envelope: Arc::clone(&envelope),
            drop_probe: Some(Arc::clone(&probe)),
        }));
        let token_pointer: *mut HandleToken = &mut **token;
        let key = HandleKey {
            allocation: token_pointer as usize,
            generation,
        };
        token.key = key;
        let replacement_request =
            decode_create_request(SMOKE_REQUEST.as_bytes()).expect("replacement request");
        let replacement = KernelSession::create(replacement_request).expect("replacement session");
        let replacement_key = HandleKey {
            allocation: key.allocation,
            generation: generation + 1,
        };
        let replacement_envelope = Arc::new(HandleEnvelope {
            generation: replacement_key.generation,
            environment: 1,
            owner_thread: thread::current().id(),
            session: Mutex::new(replacement.session),
            drop_probe: None,
        });
        {
            let mut table = table_lock().expect("live table");
            assert!(table.insert(key, Arc::clone(&envelope)).is_none());
            assert!(
                table
                    .insert(replacement_key, Arc::clone(&replacement_envelope))
                    .is_none()
            );
        }
        drop(envelope);

        // SAFETY: the ManuallyDrop allocation exactly models the successful wrap owner transfer;
        // this is its sole finalizer invocation and no test accesses the token afterward.
        unsafe {
            finalize_kernel_session_handle(ptr::null_mut(), token_pointer.cast(), ptr::null_mut());
        }

        assert!(weak_envelope.upgrade().is_none());
        assert_eq!(probe.token_drops.load(Ordering::Relaxed), 1);
        assert_eq!(probe.envelope_drops.load(Ordering::Relaxed), 1);
        let mut table = table_lock().expect("final table");
        assert!(!table.contains_key(&key));
        assert!(table.contains_key(&replacement_key));
        table.remove(&replacement_key);
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
