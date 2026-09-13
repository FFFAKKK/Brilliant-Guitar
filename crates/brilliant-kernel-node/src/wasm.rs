//! Separately built private Wasm artifact. The returned function retains only
//! immutable compiled code; each invocation creates its own bounded guest Store.
use crate::napi::{
    self, Env,
    bindgen_prelude::{Buffer, Function},
};
use brilliant_kernel_session::{WasmExecutorV1, WasmLimitsV1};
use napi_derive::napi;
use std::panic::{AssertUnwindSafe, catch_unwind};

mod budget;
pub(crate) use budget::{OperationScope, operation_failed};

#[napi(js_name = "createWasmModuleExecutorV1")]
pub fn create_wasm_module_executor_v1<'env>(
    env: &'env Env,
    bytes: Buffer,
    expected_sha256: Buffer,
    abi_version: f64,
) -> napi::Result<Function<'env, Buffer, Buffer>> {
    let executor = catch_unwind(AssertUnwindSafe(|| {
        let digest: [u8; 32] = expected_sha256.as_ref().try_into().map_err(|_| ())?;
        if abi_version != 1.0 {
            return Err(());
        }
        WasmExecutorV1::capture(&bytes, digest, 1, WasmLimitsV1::default()).map_err(|_| ())
    }))
    .map_err(|_| napi::Error::from_reason("wasm.capture-failed"))?
    .map_err(|_| napi::Error::from_reason("wasm.capture-failed"))?;
    env.create_function_from_closure("executeWasmModuleV1", move |context| {
        let input: Buffer = context.first_arg()?;
        catch_unwind(AssertUnwindSafe(|| budget::execute(&executor, &input)))
            .map_err(|_| napi::Error::from_reason("wasm.execution-failed"))?
            .map(|output| Buffer::from(output.bytes))
            .map_err(|_| napi::Error::from_reason("wasm.execution-failed"))
    })
}
