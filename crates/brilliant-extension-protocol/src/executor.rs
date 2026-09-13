//! Versioned private host execution seam. Results never authorize direct writes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ContributionExecutionFailureV2 {
    Callback,
}

/// Private read capability. It is borrowed only for one executor invocation.
/// It cannot select another candidate, read extensions, or mutate a session.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ContributionReadFailureV2 {
    InvalidRequest,
    Unavailable,
    InvalidSource,
    ResourceLimit,
}

pub trait ContributionCoreReadV2 {
    fn read_core(&mut self, request: &[u8]) -> Result<Vec<u8>, ContributionReadFailureV2>;
}

pub trait ContributionExecutorV2 {
    fn execute(&mut self, request: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2>;

    /// Opt-in private host protocol: Runtime schedules individual assessment
    /// callbacks and retains aggregation authority. Existing adapters stay V2.
    fn uses_scoped_assessment(&self) -> bool {
        false
    }

    /// Existing executors retain their full-input path. A successor adapter may
    /// expose this capability only within the synchronous callback lifetime.
    fn execute_with_core_reads(
        &mut self,
        request: &[u8],
        _reads: &mut dyn ContributionCoreReadV2,
    ) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        self.execute(request)
    }
}
