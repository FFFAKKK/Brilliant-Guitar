#![forbid(unsafe_code)]

// Exceptional admission preserves a typed prefix and occurrence-based suffix.
mod candidate;
mod change_set;
mod checkpoint;
mod handles;
mod history;
mod incremental_validation;
mod indices;
mod overlay;
mod records;
mod runtime;
mod selectors;
mod session_projection;
mod store;
mod time_index;
mod topology;
mod transaction;
mod validation_diagnostics;

pub use runtime::{
    DomainAvailabilityAssessmentV1, KernelRuntime, KernelRuntimeCreateFailure,
    KernelRuntimeReadFailure, KernelStage3PreparedV1, KernelStage3TransactionV1,
};
