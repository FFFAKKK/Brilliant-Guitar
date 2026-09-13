pub use brilliant_extension_protocol::{
    ContributionCoreReadV2, ContributionExecutionFailureV2, ContributionExecutorV2,
    ContributionReadFailureV2,
};
use brilliant_kernel_runtime::IntegratedKernelRuntimeV2;

/// Fixed host assembly; all state and editing history remain in the Rust runtime.
pub struct IntegratedKernelSessionV2 {
    runtime: IntegratedKernelRuntimeV2,
}

#[cfg(test)]
mod read_tests;
impl IntegratedKernelSessionV2 {
    /// Detached migration service; does not create or mutate an editing session.
    pub fn migrate_extension(bytes: &[u8], executor: &mut dyn ContributionExecutorV2) -> Vec<u8> {
        IntegratedKernelRuntimeV2::migrate_extension(bytes, executor)
    }
    pub fn create(
        bytes: &[u8],
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Self, Vec<u8>> {
        IntegratedKernelRuntimeV2::create(bytes, executor).map(|runtime| Self { runtime })
    }
    pub fn operate(&mut self, bytes: &[u8], executor: &mut dyn ContributionExecutorV2) -> Vec<u8> {
        self.runtime
            .operate(bytes, executor, crate::commands::dispatch)
    }
}
