use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

const MAX_FILE_BYTES: u64 = 1_048_576;
const MAX_FILES: usize = 3;
const MAX_RECORDS: usize = 256;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginDiagnosticRecord {
    pub report_id: String,
    pub occurred_at: u64,
    pub code: String,
    pub stage: String,
    pub operation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub module_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contribution_id: Option<String>,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginDiagnosticInput {
    pub report_id: Option<String>,
    pub occurred_at: Option<u64>,
    pub code: String,
    pub stage: String,
    pub operation: String,
    pub module_id: Option<String>,
    pub contribution_id: Option<String>,
}

#[derive(Debug)]
pub struct DiagnosticLog {
    root: PathBuf,
    gate: Mutex<()>,
}

impl DiagnosticLog {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            gate: Mutex::new(()),
        }
    }

    pub fn append(&self, input: PluginDiagnosticInput) -> io::Result<PluginDiagnosticRecord> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("diagnostic log lock poisoned"))?;
        validate_input(&input)?;
        let message = message_for_code(&input.code)
            .ok_or_else(invalid_input)?
            .to_owned();
        let record = PluginDiagnosticRecord {
            report_id: input
                .report_id
                .unwrap_or_else(|| format!("BG-RUST-{}", Uuid::new_v4())),
            occurred_at: input.occurred_at.unwrap_or_else(now_millis),
            code: input.code,
            stage: input.stage,
            operation: input.operation,
            module_id: input.module_id,
            contribution_id: input.contribution_id,
            message,
        };
        let bytes = serde_json::to_vec(&record).map_err(io::Error::other)?;
        self.rotate_if_needed()?;
        fs::create_dir_all(&self.root)?;
        let mut file = OpenOptions::new()
            .create(true)
            .read(true)
            .append(true)
            .open(self.path())?;
        if file.metadata()?.len() > 0 {
            file.seek(SeekFrom::End(-1))?;
            let mut tail = [0];
            file.read_exact(&mut tail)?;
            if tail[0] != b'\n' {
                // A previous process may have stopped in the middle of a
                // write. Keep that corrupt line separate from this record.
                file.write_all(b"\n")?;
            }
        }
        file.write_all(&bytes)?;
        file.write_all(b"\n")?;
        file.flush()?;
        Ok(record)
    }

    pub fn list(&self, limit: usize) -> io::Result<Vec<PluginDiagnosticRecord>> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| io::Error::other("diagnostic log lock poisoned"))?;
        let mut records = Vec::new();
        // File order is authoritative. A renderer-supplied timestamp must not
        // make a new diagnostic look older than a previous process's record.
        for path in self.paths().into_iter().rev() {
            if !path.exists() {
                continue;
            }
            let file = File::open(path)?;
            for line in BufReader::new(file).lines() {
                let line = line?;
                if let Ok(record) = serde_json::from_str::<PluginDiagnosticRecord>(&line) {
                    records.push(record);
                }
            }
        }
        let keep = limit.clamp(1, MAX_RECORDS);
        if records.len() > keep {
            records.drain(..records.len() - keep);
        }
        Ok(records)
    }

    fn path(&self) -> PathBuf {
        self.root.join("plugin-diagnostics.ndjson")
    }

    fn paths(&self) -> [PathBuf; MAX_FILES] {
        [
            self.path(),
            self.root.join("plugin-diagnostics.ndjson.1"),
            self.root.join("plugin-diagnostics.ndjson.2"),
        ]
    }

    fn rotate_if_needed(&self) -> io::Result<()> {
        let path = self.path();
        let size = fs::metadata(&path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        if size < MAX_FILE_BYTES {
            return Ok(());
        }
        fs::create_dir_all(&self.root)?;
        let paths = self.paths();
        let oldest = &paths[MAX_FILES - 1];
        if oldest.exists() {
            fs::remove_file(oldest)?;
        }
        for index in (1..MAX_FILES).rev() {
            let previous = &paths[index - 1];
            let next = &paths[index];
            if previous.exists() {
                fs::rename(previous, next)?;
            }
        }
        Ok(())
    }
}

fn invalid_input() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, "invalid plugin diagnostic")
}

fn valid_identifier(value: &str, limit: usize) -> bool {
    !value.is_empty()
        && value.len() <= limit
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
}

fn validate_input(value: &PluginDiagnosticInput) -> io::Result<()> {
    if value
        .report_id
        .as_ref()
        .is_some_and(|id| !valid_identifier(id, 96))
        || !valid_identifier(&value.code, 96)
        || !valid_identifier(&value.stage, 40)
        || !valid_identifier(&value.operation, 40)
        || value
            .module_id
            .as_ref()
            .is_some_and(|id| !valid_identifier(id, 128))
        || value
            .contribution_id
            .as_ref()
            .is_some_and(|id| !valid_identifier(id, 128))
        || !valid_stage_and_operation(&value.code, &value.stage, &value.operation)
    {
        return Err(invalid_input());
    }
    Ok(())
}

fn valid_stage_and_operation(code: &str, stage: &str, operation: &str) -> bool {
    if code.starts_with("UI-PLG-") {
        return operation == "ui-plugin"
            && matches!(
                stage,
                "manifest"
                    | "requirements"
                    | "contributions"
                    | "permissions"
                    | "registration"
                    | "resolution"
            );
    }
    matches!(
        operation,
        "create" | "prepare" | "transform" | "assess" | "migration" | "read"
    ) && matches!(
        stage,
        "assembly" | "binding" | "callback" | "core-read" | "transport"
    )
}

fn message_for_code(code: &str) -> Option<&'static str> {
    Some(match code {
        "UI-PLG-001" => "界面插件清单无效",
        "UI-PLG-002" => "界面插件重复加载",
        "UI-PLG-003" => "插件需要的工作台能力不可用",
        "UI-PLG-004" => "插件需要的数据投影不可用",
        "UI-PLG-005" => "插件贡献与清单不一致",
        "UI-PLG-006" => "插件包含重复贡献",
        "UI-PLG-007" => "插件视图定义无效",
        "UI-PLG-008" => "插件组件发生冲突",
        "UI-PLG-009" => "插件请求了未声明的权限",
        "UI-PLG-010" => "插件命令发生冲突",
        "UI-PLG-011" => "插件命令装配失败",
        "UI-PLG-012" => "界面插件运行装配失败",
        "command.assembly-mismatch" => "插件清单与内核装配不一致",
        "command.invalid-requirement-inventory" => "插件需求清单无效或与已安装插件冲突",
        "command.required-contribution-unavailable" => "乐谱所需插件贡献不可用",
        "command.required-contribution-incompatible" => "插件不支持乐谱所需的扩展版本",
        "command.contribution-semantic-invalid" => "插件拒绝了当前乐谱状态",
        "command.contribution-contract-violation" => "插件返回结果违反内核协议",
        "command.contribution-internal-error" => "插件执行时发生内部错误",
        "wasm.invalid-addon" => "WASM 内核桥接组件无效",
        "wasm.assembly-mismatch" => "WASM 插件与当前内核装配不匹配",
        "wasm.invalid-binding" => "WASM 插件绑定或文件完整性校验失败",
        "wasm.incomplete-binding" => "存在未绑定的必需 WASM 插件",
        "wasm.invalid-result" => "WASM 插件返回了无效结果",
        "wasm.core-read-contract" => "WASM 插件读取内核数据时违反协议",
        "wasm.execution-failed" => "WASM 插件执行失败",
        _ => return None,
    })
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(index: u64) -> PluginDiagnosticInput {
        PluginDiagnosticInput {
            report_id: Some(format!("report-{index}")),
            occurred_at: Some(index),
            code: "command.assembly-mismatch".into(),
            stage: "assembly".into(),
            operation: "create".into(),
            module_id: Some("fixture.module".into()),
            contribution_id: Some("fixture.contribution".into()),
        }
    }

    #[test]
    fn diagnostics_round_trip_and_ignore_malformed_lines() {
        let root = std::env::temp_dir().join(format!("brilliant-diagnostics-{}", Uuid::new_v4()));
        let log = DiagnosticLog::new(root.clone());
        log.append(input(1)).unwrap();
        fs::OpenOptions::new()
            .append(true)
            .open(root.join("plugin-diagnostics.ndjson"))
            .unwrap()
            .write_all(b"not-json\n")
            .unwrap();
        log.append(input(2)).unwrap();
        let restarted = DiagnosticLog::new(root.clone());
        let records = restarted.list(10).unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].report_id, "report-1");
        assert_eq!(records[1].report_id, "report-2");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_truncated_last_line_does_not_swallow_the_next_process_record() {
        let root = std::env::temp_dir().join(format!("brilliant-diagnostics-{}", Uuid::new_v4()));
        let log = DiagnosticLog::new(root.clone());
        log.append(input(1)).unwrap();
        OpenOptions::new()
            .append(true)
            .open(root.join("plugin-diagnostics.ndjson"))
            .unwrap()
            .write_all(b"{\"reportId\":\"interrupted")
            .unwrap();
        let restarted = DiagnosticLog::new(root.clone());
        restarted.append(input(2)).unwrap();
        let records = restarted.list(10).unwrap();
        assert_eq!(
            records
                .iter()
                .map(|record| record.report_id.as_str())
                .collect::<Vec<_>>(),
            ["report-1", "report-2"]
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn summary_is_derived_from_a_known_code_not_a_client_payload() {
        let root = std::env::temp_dir().join(format!("brilliant-diagnostics-{}", Uuid::new_v4()));
        let log = DiagnosticLog::new(root.clone());
        let record = log.append(input(1)).unwrap();
        assert_eq!(record.message, "插件清单与内核装配不一致");
        assert!(
            serde_json::from_value::<PluginDiagnosticInput>(serde_json::json!({
                "reportId": "report-2", "occurredAt": 2, "code": "command.assembly-mismatch",
                "stage": "assembly", "operation": "create", "moduleId": "fixture.module",
                "contributionId": "fixture.contribution", "message": "private score payload"
            }))
            .is_err()
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_invalid_identifiers_and_unknown_codes() {
        let root = std::env::temp_dir().join(format!("brilliant-diagnostics-{}", Uuid::new_v4()));
        let log = DiagnosticLog::new(root.clone());
        let mut malformed = input(1);
        malformed.module_id = Some("../outside".into());
        assert_eq!(
            log.append(malformed).unwrap_err().kind(),
            io::ErrorKind::InvalidInput
        );
        let mut malformed = input(2);
        malformed.code = "command.unknown-plugin-failure".into();
        assert_eq!(
            log.append(malformed).unwrap_err().kind(),
            io::ErrorKind::InvalidInput
        );
        assert!(!root.exists());
    }

    #[test]
    fn rotates_and_reads_in_append_order_even_with_untrusted_timestamps() {
        let root = std::env::temp_dir().join(format!("brilliant-diagnostics-{}", Uuid::new_v4()));
        let log = DiagnosticLog::new(root.clone());
        log.append(input(100)).unwrap();
        let filler = "not-json\n".repeat((MAX_FILE_BYTES as usize / 9) + 1);
        OpenOptions::new()
            .append(true)
            .open(root.join("plugin-diagnostics.ndjson"))
            .unwrap()
            .write_all(filler.as_bytes())
            .unwrap();
        log.append(input(1)).unwrap();
        let restarted = DiagnosticLog::new(root.clone());
        let records = restarted.list(10).unwrap();
        assert_eq!(
            records
                .iter()
                .map(|entry| entry.report_id.as_str())
                .collect::<Vec<_>>(),
            ["report-100", "report-1"]
        );
        assert!(root.join("plugin-diagnostics.ndjson.1").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn concurrent_appends_keep_complete_individual_records() {
        let root = std::env::temp_dir().join(format!("brilliant-diagnostics-{}", Uuid::new_v4()));
        let log = std::sync::Arc::new(DiagnosticLog::new(root.clone()));
        std::thread::scope(|scope| {
            for worker in 0..4 {
                let log = std::sync::Arc::clone(&log);
                scope.spawn(move || {
                    for index in 0..20 {
                        log.append(input(worker * 20 + index)).unwrap();
                    }
                });
            }
        });
        let records = log.list(128).unwrap();
        assert_eq!(records.len(), 80);
        let unique = records
            .iter()
            .map(|entry| entry.report_id.as_str())
            .collect::<std::collections::HashSet<_>>();
        assert_eq!(unique.len(), 80);
        let _ = fs::remove_dir_all(root);
    }
}
