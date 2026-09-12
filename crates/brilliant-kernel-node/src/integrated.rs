//! Private V2 artifact. The returned JS function owns the session and the fixed
//! SDK callback together; no public handle can substitute another executor.
use crate::napi::{
    self, Env,
    bindgen_prelude::{Buffer, Function},
};
use brilliant_kernel_session::{
    ContributionExecutionFailureV2, ContributionExecutorV2, IntegratedKernelSessionV2,
};
use napi_derive::napi;
use std::{
    cell::RefCell,
    panic::{AssertUnwindSafe, catch_unwind},
};

struct NodeExecutor<'a> {
    callback: Function<'a, Buffer, Buffer>,
}

#[napi(js_name = "migrateKernelExtensionV2")]
pub fn migrate_kernel_extension_v2(
    request: Buffer,
    callback: Function<'_, Buffer, Buffer>,
) -> Buffer {
    catch_unwind(AssertUnwindSafe(|| {
        IntegratedKernelSessionV2::migrate_extension(&request, &mut NodeExecutor { callback })
    }))
    .unwrap_or_else(|_| {
        b"{\"status\":\"rejected\",\"failure\":{\"code\":\"migration.internal-error\"}}".to_vec()
    })
    .into()
}
impl ContributionExecutorV2 for NodeExecutor<'_> {
    fn execute(&mut self, request: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        let result = self
            .callback
            .call(Buffer::from(request.to_vec()))
            .map_err(|_| ContributionExecutionFailureV2::Callback)?;
        if result.len() > brilliant_kernel_contracts::RESPONSE_BYTE_LIMIT {
            return Err(ContributionExecutionFailureV2::Callback);
        }
        Ok(result.to_vec())
    }
}

#[napi(js_name = "createIntegratedKernelSessionV2")]
pub fn create_integrated_kernel_session_v2<'env>(
    env: &'env Env,
    request: Buffer,
    callback: Function<'env, Buffer, Buffer>,
) -> napi::Result<Function<'env, Buffer, Buffer>> {
    let retained = callback.create_ref()?;
    let session = catch_unwind(AssertUnwindSafe(|| {
        IntegratedKernelSessionV2::create(&request, &mut NodeExecutor { callback })
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
            session.operate(&bytes, &mut NodeExecutor { callback })
        }))
        .unwrap_or_else(|_| {
            b"{\"ok\":false,\"failure\":{\"code\":\"bridge.panic-contained\"}}".to_vec()
        });
        Ok(Buffer::from(result))
    })
}
