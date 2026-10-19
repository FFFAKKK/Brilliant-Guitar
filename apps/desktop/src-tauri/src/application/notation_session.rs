//! Fixed desktop composition of one official integrated session and one executor.
use super::official_domains;
use crate::error::HostError;
use brilliant_core_types::JsonValue;
use brilliant_kernel_contracts::KernelSessionCreateRequestV1;
use brilliant_kernel_session::IntegratedKernelSessionV2;
use brilliant_score_foundation::{LosslessEncode, decode_js_value_json};

pub(super) struct NotationSession {
    session: IntegratedKernelSessionV2,
    executor: official_domains::Executor,
}
impl NotationSession {
    pub(super) fn create(request: KernelSessionCreateRequestV1) -> Result<Self, HostError> {
        if request.api_version != 1 {
            return Err(HostError::new("无法建立该版本的乐谱会话", 422));
        }
        let mut input = official_domains::assembly();
        let JsonValue::Object(fields) = &mut input else {
            return Err(HostError::internal());
        };
        let mut bytes = Vec::new();
        request
            .document
            .write_lossless(&mut bytes)
            .map_err(|_| HostError::internal())?;
        fields.insert(
            "document".into(),
            decode_js_value_json(std::str::from_utf8(&bytes).map_err(|_| HostError::internal())?)
                .map_err(|_| HostError::internal())?,
        );
        bytes.clear();
        input
            .write_lossless(&mut bytes)
            .map_err(|_| HostError::internal())?;
        let mut executor = official_domains::Executor::new().map_err(|_| HostError::internal())?;
        let session = IntegratedKernelSessionV2::create(&bytes, &mut executor)
            .map_err(|_| HostError::new("无法建立乐谱领域会话，文件内容或贡献不兼容", 422))?;
        Ok(Self { session, executor })
    }
    pub(super) fn operate(
        &mut self,
        request: serde_json::Value,
    ) -> Result<serde_json::Value, HostError> {
        let bytes = serde_json::to_vec(&request).map_err(|_| HostError::internal())?;
        serde_json::from_slice(&self.session.operate(&bytes, &mut self.executor))
            .map_err(|_| HostError::internal())
    }
    pub(super) fn read_state(&self) -> brilliant_kernel_contracts::KernelSessionReadResultV1 {
        self.session.read_core_state()
    }
    pub(super) fn select_stage4(
        &self,
        query: brilliant_kernel_contracts::SelectorRequestV1,
    ) -> brilliant_kernel_contracts::KernelStage4SelectValueV1 {
        self.session.select_stage4(query)
    }
    pub(super) fn read_rule_warning_page(
        &self,
        id: &brilliant_core_types::StableId,
        version: brilliant_core_types::DocumentVersionV1,
        offset: usize,
        limit: usize,
    ) -> Result<
        brilliant_kernel_contracts::KernelRuleWarningPageV1,
        brilliant_kernel_contracts::KernelRuleWarningReadFailureV1,
    > {
        self.session
            .read_rule_warning_page(id, version, offset, limit)
    }
}
