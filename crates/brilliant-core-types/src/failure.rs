#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CoreTypeFailure {
    EmptyStableId,
    NumberOutOfRange,
    JsonDepthLimit { actual: usize },
    JsonPropertyLimit { actual: usize },
    InvalidStablePath,
}
