//! Private V2 artifact. The returned JS function owns the session and the fixed
//! SDK callback together; no public handle can substitute another executor.
use crate::napi::{
    self, Env,
    bindgen_prelude::{Buffer, Function},
};
use brilliant_kernel_session::{
    ContributionCoreReadV2, ContributionExecutionFailureV2, ContributionExecutorV2,
    IntegratedKernelSessionV2,
};
use napi_derive::napi;
use std::{
    cell::RefCell,
    panic::{AssertUnwindSafe, catch_unwind},
};

mod host_budget;

struct NodeExecutor<'a> {
    callback: Function<'a, Buffer, Buffer>,
    core_reads: bool,
    scoped_assessment: bool,
    scoped_preparation: bool,
}

// Explicit opt-in only. Ordinary callback inputs/replies remain JSON; these
// disjoint frames carry a single query/reply during the current Rust callback.
const READ_QUERY: &[u8] = b"BGCR2Q\0";
const READ_REPLY: &[u8] = b"BGCR2R\0";

fn read_protocol(version: Option<f64>) -> napi::Result<u8> {
    match version {
        None => Ok(0),
        Some(2.0) => Ok(2),
        Some(3.0) => Ok(3),
        Some(4.0) => Ok(4),
        _ => Err(napi::Error::from_reason(
            "bridge.unsupported-core-read-protocol",
        )),
    }
}

#[napi(js_name = "migrateKernelExtensionV2")]
pub fn migrate_kernel_extension_v2(
    request: Buffer,
    callback: Function<'_, Buffer, Buffer>,
    core_read_protocol: Option<f64>,
) -> napi::Result<Buffer> {
    let protocol = read_protocol(core_read_protocol)?;
    if protocol == 3 {
        return Err(napi::Error::from_reason(
            "bridge.unsupported-migration-protocol",
        ));
    }
    let core_reads = protocol >= 2;
    Ok(catch_unwind(AssertUnwindSafe(|| {
        let _host_budget = host_budget::OperationScope::enter(core_reads);
        #[cfg(feature = "wasm-bridge-v1")]
        let _budget = crate::wasm::OperationScope::enter();
        IntegratedKernelSessionV2::migrate_extension(
            &request,
            &mut NodeExecutor {
                callback,
                core_reads,
                scoped_assessment: false,
                scoped_preparation: protocol == 4,
            },
        )
    }))
    .unwrap_or_else(|_| {
        b"{\"status\":\"rejected\",\"failure\":{\"code\":\"migration.internal-error\"}}".to_vec()
    })
    .into())
}
impl NodeExecutor<'_> {
    fn call(&mut self, request: &[u8]) -> Result<Buffer, ContributionExecutionFailureV2> {
        if !host_budget::charge(request.len()) {
            return Err(ContributionExecutionFailureV2::Callback);
        }
        #[cfg(feature = "wasm-bridge-v1")]
        if crate::wasm::operation_failed() {
            return Err(ContributionExecutionFailureV2::Callback);
        }
        let result = self
            .callback
            .call(Buffer::from(request.to_vec()))
            .map_err(|_| ContributionExecutionFailureV2::Callback)?;
        if !host_budget::charge(result.len()) {
            return Err(ContributionExecutionFailureV2::Callback);
        }
        #[cfg(feature = "wasm-bridge-v1")]
        if crate::wasm::operation_failed() {
            return Err(ContributionExecutionFailureV2::Callback);
        }
        Ok(result)
    }
}

impl ContributionExecutorV2 for NodeExecutor<'_> {
    fn uses_scoped_assessment(&self) -> bool {
        self.scoped_assessment
    }
    fn uses_scoped_preparation(&self) -> bool {
        self.scoped_preparation
    }

    fn execute(&mut self, request: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        let result = self.call(request)?;
        capture_reply(result)
    }
    fn execute_with_core_reads(
        &mut self,
        request: &[u8],
        reads: &mut dyn ContributionCoreReadV2,
    ) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        let mut result = self.call(request)?;
        if !self.core_reads {
            return capture_reply(result);
        }
        while let Some(query) = result.strip_prefix(READ_QUERY) {
            let reply = reads
                .read_core(query)
                .map_err(|_| ContributionExecutionFailureV2::Callback)?;
            let mut frame = Vec::with_capacity(READ_REPLY.len() + reply.len());
            frame.extend_from_slice(READ_REPLY);
            frame.extend_from_slice(&reply);
            result = self.call(&frame)?;
        }
        capture_reply(result)
    }
}

fn capture_reply(result: Buffer) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
    if result.len() > brilliant_kernel_contracts::RESPONSE_BYTE_LIMIT {
        return Err(ContributionExecutionFailureV2::Callback);
    }
    Ok(result.to_vec())
}

#[napi(js_name = "createIntegratedKernelSessionV2")]
pub fn create_integrated_kernel_session_v2<'env>(
    env: &'env Env,
    request: Buffer,
    callback: Function<'env, Buffer, Buffer>,
    core_read_protocol: Option<f64>,
) -> napi::Result<Function<'env, Buffer, Buffer>> {
    let protocol = read_protocol(core_read_protocol)?;
    let core_reads = protocol >= 2;
    let retained = callback.create_ref()?;
    let session = catch_unwind(AssertUnwindSafe(|| {
        let _host_budget = host_budget::OperationScope::enter(core_reads);
        #[cfg(feature = "wasm-bridge-v1")]
        let _budget = crate::wasm::OperationScope::enter();
        IntegratedKernelSessionV2::create(
            &request,
            &mut NodeExecutor {
                callback,
                core_reads,
                scoped_assessment: protocol >= 3,
                scoped_preparation: protocol == 4,
            },
        )
    }))
    .map_err(|_| napi::Error::from_reason("{\"code\":\"bridge.panic-contained\"}"))?
    .map_err(|failure| napi::Error::from_reason(String::from_utf8_lossy(&failure).into_owned()))?;
    let session = RefCell::new(session);
    env.create_function_from_closure("operateIntegratedKernelSessionV2", move |context| {
        let bytes: Buffer = context.first_arg()?;
        // This borrow guard exists before any JS callback and remains held until
        // the operation completes. Reentry cannot obtain a mutable Rust alias.
        let Ok(mut session) = session.try_borrow_mut() else {
            return Ok(Buffer::from(
                b"{\"ok\":false,\"failure\":{\"code\":\"event.reentrant-write\"}}".to_vec(),
            ));
        };
        let callback = retained.borrow_back(context.env)?;
        let result = catch_unwind(AssertUnwindSafe(|| {
            let _host_budget = host_budget::OperationScope::enter(core_reads);
            #[cfg(feature = "wasm-bridge-v1")]
            let _budget = crate::wasm::OperationScope::enter();
            session.operate(
                &bytes,
                &mut NodeExecutor {
                    callback,
                    core_reads,
                    scoped_assessment: protocol >= 3,
                    scoped_preparation: protocol == 4,
                },
            )
        }))
        .unwrap_or_else(|_| {
            b"{\"ok\":false,\"failure\":{\"code\":\"bridge.panic-contained\"}}".to_vec()
        });
        Ok(Buffer::from(result))
    })
}
