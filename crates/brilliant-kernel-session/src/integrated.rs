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
#[cfg(test)]
mod scheduled_assessment_tests;
#[cfg(test)]
mod scheduled_migration_tests;
impl IntegratedKernelSessionV2 {
    /// Core-shaped detached read facts; domain availability remains on `operate(read)`.
    pub fn read_core_state(&self) -> brilliant_kernel_contracts::KernelSessionReadResultV1 {
        self.runtime.read_core_state()
    }

    pub fn select_stage4(
        &self,
        selector: brilliant_kernel_contracts::SelectorRequestV1,
    ) -> brilliant_kernel_contracts::KernelStage4SelectValueV1 {
        self.runtime.select_stage4(selector)
    }

    pub fn read_rule_warning_page(
        &self,
        document_id: &brilliant_core_types::StableId,
        document_version: brilliant_core_types::DocumentVersionV1,
        offset: usize,
        limit: usize,
    ) -> Result<
        brilliant_kernel_contracts::KernelRuleWarningPageV1,
        brilliant_kernel_contracts::KernelRuleWarningReadFailureV1,
    > {
        self.runtime
            .read_rule_warning_page_v1(document_id, document_version, offset, limit)
    }

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
