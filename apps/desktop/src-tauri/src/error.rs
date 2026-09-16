use std::fmt;

use serde::Serialize;

use crate::dto::{
    WorkbenchIssue, WorkbenchIssueSeverity, WorkbenchIssueSource, WorkbenchIssueTarget,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostError {
    pub message: String,
    pub status: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub issue: Option<Box<WorkbenchIssue>>,
}

impl HostError {
    pub fn new(message: impl Into<String>, status: u16) -> Self {
        Self {
            message: message.into(),
            status,
            issue: None,
        }
    }

    pub fn issue(
        code: impl Into<String>,
        message: impl Into<String>,
        status: u16,
        source: WorkbenchIssueSource,
        target: WorkbenchIssueTarget,
        retryable: Option<bool>,
    ) -> Self {
        let message = message.into();
        Self {
            message: message.clone(),
            status,
            issue: Some(Box::new(WorkbenchIssue {
                code: code.into(),
                message,
                severity: WorkbenchIssueSeverity::Error,
                source,
                target,
                retryable,
            })),
        }
    }

    pub fn internal() -> Self {
        Self::issue(
            "host.internal",
            "暂时无法完成操作，请稍后重试",
            503,
            WorkbenchIssueSource::Host,
            WorkbenchIssueTarget::Workbench,
            Some(true),
        )
    }
}

impl fmt::Display for HostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for HostError {}
