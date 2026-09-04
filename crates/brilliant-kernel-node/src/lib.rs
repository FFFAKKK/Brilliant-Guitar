#![deny(unsafe_code)]
#![deny(unsafe_op_in_unsafe_fn)]

extern crate napi as napi_crate;

mod napi {
    pub use napi_crate::*;

    pub mod bindgen_prelude {
        pub use napi_crate::bindgen_prelude::*;

        // napi-derive 3.6.2 emits this guard pair while napi 3.12.0 predates their public
        // definitions. These exports accept no native Rust borrows, so the compatibility guards
        // have no values to track and deliberately remain inert.
        pub struct NativeBorrowScope;

        impl NativeBorrowScope {
            pub fn new() -> Self {
                Self
            }

            pub fn finish(&mut self) {}
        }

        pub struct NativeBorrowBarrier;

        impl NativeBorrowBarrier {
            pub fn new() -> Self {
                Self
            }
        }
    }
}

use napi::{
    Env,
    bindgen_prelude::{Buffer, Object, Unknown},
};
use napi_derive::napi;

#[allow(unsafe_code)]
mod boundary;

#[napi(js_name = "createKernelSessionV1")]
pub fn create_kernel_session_v1(
    env: Env,
    request_bytes: Unknown<'_>,
) -> napi::Result<Object<'static>> {
    boundary::create_kernel_session(&env, &request_bytes)
}

#[napi(js_name = "readKernelSessionV1")]
pub fn read_kernel_session_v1(env: Env, handle: Unknown<'_>) -> Buffer {
    boundary::read_kernel_session(&env, &handle)
}

#[napi]
pub fn submit_kernel_stage3_v1(
    env: Env,
    handle: Unknown<'_>,
    request_bytes: Unknown<'_>,
) -> Buffer {
    boundary::submit_kernel_stage3(&env, &handle, &request_bytes)
}

#[cfg(test)]
mod tests {
    use super::napi::bindgen_prelude::{NativeBorrowBarrier, NativeBorrowScope};

    #[test]
    fn pinned_macro_compatibility_guards_are_inert_for_value_only_exports() {
        let mut scope = NativeBorrowScope::new();
        scope.finish();
        let _barrier = NativeBorrowBarrier::new();
    }
}
