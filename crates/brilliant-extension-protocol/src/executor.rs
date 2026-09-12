//! Versioned private host execution seam. Results never authorize direct writes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ContributionExecutionFailureV2 {
    Callback,
}

pub trait ContributionExecutorV2 {
    fn execute(&mut self, request: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2>;
}
