include!("../src/lib.rs");

#[cfg(windows)]
#[path = "../src/native_close_tests.rs"]
mod native_close_tests;
