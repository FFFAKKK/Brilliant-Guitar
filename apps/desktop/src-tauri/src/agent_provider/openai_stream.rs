use serde_json::Value;

#[derive(Clone, Debug, PartialEq)]
pub(super) enum OpenAiStreamEvent {
    Started,
    TextDelta(String),
    ToolInputDelta {
        call_id: String,
        delta: String,
    },
    Usage {
        input_tokens: u64,
        output_tokens: u64,
        total_tokens: u64,
    },
    Completed(Value),
    Failed(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum OpenAiStreamError {
    InvalidEvent,
    TooLarge,
    Incomplete,
}

pub(super) struct OpenAiSseDecoder {
    buffer: Vec<u8>,
    received_bytes: usize,
    max_bytes: usize,
    terminal: bool,
}

impl OpenAiSseDecoder {
    pub(super) fn new(max_bytes: usize) -> Self {
        Self {
            buffer: Vec::new(),
            received_bytes: 0,
            max_bytes,
            terminal: false,
        }
    }

    pub(super) fn push(
        &mut self,
        chunk: &[u8],
    ) -> Result<Vec<OpenAiStreamEvent>, OpenAiStreamError> {
        self.received_bytes = self.received_bytes.saturating_add(chunk.len());
        if self.received_bytes > self.max_bytes {
            return Err(OpenAiStreamError::TooLarge);
        }
        self.buffer.extend_from_slice(chunk);

        let mut events = Vec::new();
        while let Some((frame_end, separator_len)) = frame_boundary(&self.buffer) {
            let frame = self.buffer.drain(..frame_end).collect::<Vec<_>>();
            self.buffer.drain(..separator_len);
            for event in decode_frame(&frame)? {
                if self.terminal {
                    return Err(OpenAiStreamError::InvalidEvent);
                }
                if matches!(
                    event,
                    OpenAiStreamEvent::Completed(_) | OpenAiStreamEvent::Failed(_)
                ) {
                    self.terminal = true;
                }
                events.push(event);
            }
        }
        Ok(events)
    }

    pub(super) fn finish(self) -> Result<(), OpenAiStreamError> {
        if !self.buffer.iter().all(u8::is_ascii_whitespace) {
            return Err(OpenAiStreamError::InvalidEvent);
        }
        if !self.terminal {
            return Err(OpenAiStreamError::Incomplete);
        }
        Ok(())
    }
}

fn frame_boundary(buffer: &[u8]) -> Option<(usize, usize)> {
    let unix = buffer.windows(2).position(|window| window == b"\n\n");
    let windows = buffer.windows(4).position(|window| window == b"\r\n\r\n");
    match (unix, windows) {
        (Some(left), Some(right)) if left <= right => Some((left, 2)),
        (Some(_), Some(right)) => Some((right, 4)),
        (Some(index), None) => Some((index, 2)),
        (None, Some(index)) => Some((index, 4)),
        (None, None) => None,
    }
}

fn decode_frame(frame: &[u8]) -> Result<Vec<OpenAiStreamEvent>, OpenAiStreamError> {
    let frame = std::str::from_utf8(frame).map_err(|_| OpenAiStreamError::InvalidEvent)?;
    let data = frame
        .lines()
        .filter_map(|line| {
            line.strip_suffix('\r')
                .unwrap_or(line)
                .strip_prefix("data:")
        })
        .map(|line| line.strip_prefix(' ').unwrap_or(line))
        .collect::<Vec<_>>()
        .join("\n");
    if data.is_empty() || data == "[DONE]" {
        return Ok(Vec::new());
    }
    let value: Value = serde_json::from_str(&data).map_err(|_| OpenAiStreamError::InvalidEvent)?;
    let event_type = value
        .get("type")
        .and_then(Value::as_str)
        .ok_or(OpenAiStreamError::InvalidEvent)?;

    match event_type {
        "response.created" | "response.in_progress" => Ok(vec![OpenAiStreamEvent::Started]),
        "response.output_text.delta" => match value.get("delta").and_then(Value::as_str) {
            Some("") => Ok(Vec::new()),
            Some(delta) => Ok(vec![OpenAiStreamEvent::TextDelta(delta.to_owned())]),
            None => Err(OpenAiStreamError::InvalidEvent),
        },
        "response.function_call_arguments.delta" => {
            let call_id = value
                .get("item_id")
                .or_else(|| value.get("call_id"))
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .ok_or(OpenAiStreamError::InvalidEvent)?;
            let delta = value
                .get("delta")
                .and_then(Value::as_str)
                .ok_or(OpenAiStreamError::InvalidEvent)?;
            if delta.is_empty() {
                return Ok(Vec::new());
            }
            Ok(vec![OpenAiStreamEvent::ToolInputDelta {
                call_id: call_id.to_owned(),
                delta: delta.to_owned(),
            }])
        }
        "response.completed" => {
            let response = value
                .get("response")
                .cloned()
                .ok_or(OpenAiStreamError::InvalidEvent)?;
            let mut events = Vec::new();
            if let Some(usage) = response.get("usage") {
                let input_tokens = usage
                    .get("input_tokens")
                    .and_then(Value::as_u64)
                    .ok_or(OpenAiStreamError::InvalidEvent)?;
                let output_tokens = usage
                    .get("output_tokens")
                    .and_then(Value::as_u64)
                    .ok_or(OpenAiStreamError::InvalidEvent)?;
                let total_tokens = usage
                    .get("total_tokens")
                    .and_then(Value::as_u64)
                    .ok_or(OpenAiStreamError::InvalidEvent)?;
                if total_tokens != input_tokens.saturating_add(output_tokens) {
                    return Err(OpenAiStreamError::InvalidEvent);
                }
                events.push(OpenAiStreamEvent::Usage {
                    input_tokens,
                    output_tokens,
                    total_tokens,
                });
            }
            events.push(OpenAiStreamEvent::Completed(response));
            Ok(events)
        }
        "response.failed" | "response.incomplete" | "error" => {
            let code = value
                .pointer("/response/error/code")
                .or_else(|| value.pointer("/response/incomplete_details/reason"))
                .or_else(|| value.get("code"))
                .and_then(Value::as_str)
                .unwrap_or("provider-stream-failed");
            Ok(vec![OpenAiStreamEvent::Failed(code.to_owned())])
        }
        _ => Ok(Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_chunked_text_tool_and_completed_events() {
        let response = serde_json::json!({
            "id": "resp-1",
            "status": "completed",
            "output": [],
            "usage": { "input_tokens": 3, "output_tokens": 2, "total_tokens": 5 }
        });
        let stream = format!(
            "data: {{\"type\":\"response.created\"}}\n\n\
             data: {{\"type\":\"response.output_text.delta\",\"delta\":\"hello\"}}\n\n\
             data: {{\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"item-1\",\"delta\":\"{{\\\"\"}}\n\n\
             data: {}\n\n",
            serde_json::json!({ "type": "response.completed", "response": response })
        );
        let split = stream.len() / 2;
        let mut decoder = OpenAiSseDecoder::new(16 * 1024);
        let mut events = decoder
            .push(&stream.as_bytes()[..split])
            .expect("first chunk");
        events.extend(
            decoder
                .push(&stream.as_bytes()[split..])
                .expect("second chunk"),
        );
        decoder.finish().expect("complete stream");

        assert_eq!(events[0], OpenAiStreamEvent::Started);
        assert_eq!(events[1], OpenAiStreamEvent::TextDelta("hello".into()));
        assert_eq!(
            events[2],
            OpenAiStreamEvent::ToolInputDelta {
                call_id: "item-1".into(),
                delta: "{\"".into(),
            }
        );
        assert!(matches!(
            events[3],
            OpenAiStreamEvent::Usage {
                total_tokens: 5,
                ..
            }
        ));
        assert!(matches!(events[4], OpenAiStreamEvent::Completed(_)));
    }

    #[test]
    fn ignores_unknown_events_but_rejects_truncated_and_oversized_streams() {
        let mut decoder = OpenAiSseDecoder::new(256);
        assert!(
            decoder
                .push(b"data: {\"type\":\"response.unknown\"}\n\n")
                .expect("unknown event")
                .is_empty()
        );
        assert_eq!(decoder.finish(), Err(OpenAiStreamError::Incomplete));

        let mut decoder = OpenAiSseDecoder::new(4);
        assert_eq!(decoder.push(b"12345"), Err(OpenAiStreamError::TooLarge));
    }
}
