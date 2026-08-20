use std::fmt;

use brilliant_core_types::{
    API_VERSION_V1, JS_SAFE_INTEGER_MAX, JSON_DEPTH_LIMIT, JSON_PROPERTY_LIMIT,
    ScoreSchemaVersionV1, StablePathV1,
};
use brilliant_extension_protocol::EXTENSION_PROTOCOL_VERSION_V1;
use brilliant_score_foundation::{FoundationDecodeFailure, decode_score_document_value};
use serde::{
    Deserializer,
    de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor},
};
use serde_json::{Map, Number, Value};

use crate::{
    KernelSessionCreateRequestV1, KernelSessionCreateResultV1, KernelSessionReadResultV1,
    ScoreStructureViolationV1, ShapeViolationV1, StableFailureV1,
};

pub const REQUEST_BYTE_LIMIT: usize = 64 * 1024 * 1024;
pub const RESPONSE_BYTE_LIMIT: usize = 64 * 1024 * 1024;

const STRICT_SENTINEL: &str = "rkp1 strict decode rejected";

#[derive(Clone, Debug, Eq, PartialEq)]
enum StrictFault {
    Depth { actual: usize },
    Property { actual: usize },
    Number,
    Duplicate,
}

#[derive(Default)]
struct StrictState {
    nodes: usize,
    fault: Option<StrictFault>,
}

impl StrictState {
    fn enter<E>(&mut self, depth: usize) -> Result<(), E>
    where
        E: de::Error,
    {
        if depth > JSON_DEPTH_LIMIT {
            self.fault
                .get_or_insert(StrictFault::Depth { actual: depth });
            return Err(E::custom(STRICT_SENTINEL));
        }
        self.nodes = self.nodes.saturating_add(1);
        if self.nodes > JSON_PROPERTY_LIMIT {
            self.fault
                .get_or_insert(StrictFault::Property { actual: self.nodes });
            return Err(E::custom(STRICT_SENTINEL));
        }
        Ok(())
    }

    fn reject<E>(&mut self, fault: StrictFault) -> Result<Value, E>
    where
        E: de::Error,
    {
        self.fault.get_or_insert(fault);
        Err(E::custom(STRICT_SENTINEL))
    }
}

struct StrictSeed<'a> {
    state: &'a mut StrictState,
    depth: usize,
}

impl<'de> DeserializeSeed<'de> for StrictSeed<'_> {
    type Value = Value;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        self.state.enter::<D::Error>(self.depth)?;
        deserializer.deserialize_any(StrictVisitor {
            state: self.state,
            depth: self.depth,
        })
    }
}

struct StrictVisitor<'a> {
    state: &'a mut StrictState,
    depth: usize,
}

impl<'de> Visitor<'de> for StrictVisitor<'_> {
    type Value = Value;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("one strict JSON value")
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(Value::Null)
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(Value::Null)
    }

    fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E> {
        Ok(Value::Bool(value))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if !(-JS_SAFE_INTEGER_MAX..=JS_SAFE_INTEGER_MAX).contains(&value) {
            return self.state.reject(StrictFault::Number);
        }
        Ok(Value::Number(Number::from(value)))
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if value > JS_SAFE_INTEGER_MAX as u64 {
            return self.state.reject(StrictFault::Number);
        }
        Ok(Value::Number(Number::from(value)))
    }

    fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if value.fract() != 0.0
            || value < -JS_SAFE_INTEGER_MAX as f64
            || value > JS_SAFE_INTEGER_MAX as f64
        {
            return self.state.reject(StrictFault::Number);
        }
        Ok(Value::Number(Number::from(value as i64)))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(Value::String(value.to_owned()))
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E> {
        Ok(Value::String(value))
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element_seed(StrictSeed {
            state: self.state,
            depth: self.depth + 1,
        })? {
            values.push(value);
        }
        Ok(Value::Array(values))
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut values = Map::new();
        while let Some(key) = map.next_key::<String>()? {
            if values.contains_key(&key) {
                self.state.fault.get_or_insert(StrictFault::Duplicate);
                return Err(de::Error::custom(STRICT_SENTINEL));
            }
            let value = map.next_value_seed(StrictSeed {
                state: self.state,
                depth: self.depth + 1,
            })?;
            values.insert(key, value);
        }
        Ok(Value::Object(values))
    }
}

fn strict_json(bytes: &[u8]) -> Result<Value, StableFailureV1> {
    let text = std::str::from_utf8(bytes).map_err(|_| StableFailureV1::CodecInvalidUtf8)?;
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let mut state = StrictState::default();
    let value = StrictSeed {
        state: &mut state,
        depth: 1,
    }
    .deserialize(&mut deserializer);
    match value {
        Ok(value) => {
            deserializer
                .end()
                .map_err(|_| StableFailureV1::CodecInvalidJson)?;
            Ok(value)
        }
        Err(_) => match state.fault {
            Some(StrictFault::Depth { actual }) => Err(StableFailureV1::CodecDepthLimit {
                limit: JSON_DEPTH_LIMIT as u64,
                actual: actual as u64,
            }),
            Some(StrictFault::Property { actual }) => Err(StableFailureV1::CodecPropertyLimit {
                limit: JSON_PROPERTY_LIMIT as u64,
                actual: actual as u64,
            }),
            Some(StrictFault::Number) => Err(StableFailureV1::CodecNumberOutOfRange {
                path: StablePathV1::root(),
            }),
            Some(StrictFault::Duplicate) => Err(StableFailureV1::CodecInvalidShape {
                path: StablePathV1::root(),
                violation: ShapeViolationV1::DuplicateField,
            }),
            None => Err(StableFailureV1::CodecInvalidJson),
        },
    }
}

pub fn validate_protocol_version(protocol_version: u64) -> Result<(), StableFailureV1> {
    if protocol_version == EXTENSION_PROTOCOL_VERSION_V1 {
        Ok(())
    } else {
        Err(StableFailureV1::ContractUnsupportedProtocolVersion {
            supported_version: EXTENSION_PROTOCOL_VERSION_V1,
        })
    }
}

pub fn decode_create_request(
    bytes: &[u8],
) -> Result<KernelSessionCreateRequestV1, StableFailureV1> {
    if bytes.len() > REQUEST_BYTE_LIMIT {
        return Err(StableFailureV1::BridgeRequestTooLarge {
            limit_bytes: REQUEST_BYTE_LIMIT as u64,
            actual_bytes: bytes.len() as u64,
        });
    }
    let value = strict_json(bytes)?;
    let object = value
        .as_object()
        .ok_or_else(|| StableFailureV1::CodecInvalidShape {
            path: StablePathV1::root(),
            violation: ShapeViolationV1::WrongType,
        })?;
    for required in ["apiVersion", "document"] {
        if !object.contains_key(required) {
            return Err(StableFailureV1::CodecInvalidShape {
                path: StablePathV1::field(required),
                violation: ShapeViolationV1::MissingField,
            });
        }
    }
    if object.len() != 2 {
        return Err(StableFailureV1::CodecInvalidShape {
            path: StablePathV1::root(),
            violation: ShapeViolationV1::ExtraField,
        });
    }
    let api_version =
        object["apiVersion"]
            .as_i64()
            .ok_or_else(|| StableFailureV1::CodecInvalidShape {
                path: StablePathV1::field("apiVersion"),
                violation: ShapeViolationV1::WrongType,
            })?;
    if api_version != API_VERSION_V1 as i64 {
        return Err(StableFailureV1::ContractUnsupportedApiVersion {
            supported_version: API_VERSION_V1,
        });
    }
    let document_value = object["document"].clone();
    let schema = document_value
        .as_object()
        .and_then(|document| document.get("schemaVersion"))
        .and_then(Value::as_str)
        .ok_or_else(|| StableFailureV1::CodecInvalidShape {
            path: StablePathV1::field("schemaVersion"),
            violation: ShapeViolationV1::WrongType,
        })?;
    if schema != ScoreSchemaVersionV1::VALUE {
        return Err(StableFailureV1::ScoreUnsupportedSchema {
            supported_schema: ScoreSchemaVersionV1::VALUE,
        });
    }
    let document = decode_score_document_value(document_value).map_err(map_foundation_failure)?;
    Ok(KernelSessionCreateRequestV1 {
        api_version: API_VERSION_V1,
        document,
    })
}

fn map_foundation_failure(failure: FoundationDecodeFailure) -> StableFailureV1 {
    match failure {
        FoundationDecodeFailure::InvalidShape => StableFailureV1::CodecInvalidShape {
            path: StablePathV1::root(),
            violation: ShapeViolationV1::WrongType,
        },
        FoundationDecodeFailure::UnsupportedSchema => StableFailureV1::ScoreUnsupportedSchema {
            supported_schema: ScoreSchemaVersionV1::VALUE,
        },
        FoundationDecodeFailure::DuplicateId => StableFailureV1::ScoreInvalidStructure {
            path: StablePathV1::root(),
            violation: ScoreStructureViolationV1::DuplicateId,
        },
        FoundationDecodeFailure::InvalidReference => StableFailureV1::ScoreInvalidStructure {
            path: StablePathV1::root(),
            violation: ScoreStructureViolationV1::InvalidReference,
        },
        FoundationDecodeFailure::InvalidValue => StableFailureV1::ScoreInvalidStructure {
            path: StablePathV1::root(),
            violation: ScoreStructureViolationV1::InvalidValue,
        },
    }
}

pub fn encode_create_result(
    result: &KernelSessionCreateResultV1,
) -> Result<Vec<u8>, StableFailureV1> {
    encode_capped(result)
}

pub fn encode_read_result(result: &KernelSessionReadResultV1) -> Result<Vec<u8>, StableFailureV1> {
    encode_capped(result)
}

fn encode_capped<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, StableFailureV1> {
    let bytes = serde_json::to_vec(value).map_err(|_| StableFailureV1::BridgeInternal)?;
    if bytes.len() > RESPONSE_BYTE_LIMIT {
        return Err(StableFailureV1::BridgeResponseTooLarge {
            limit_bytes: RESPONSE_BYTE_LIMIT as u64,
            actual_bytes: bytes.len() as u64,
        });
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use brilliant_core_types::{DocumentVersionV1, StableId};

    use super::*;
    use crate::KernelSessionCreateSuccessValueV1;

    const SMOKE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;

    fn failure_variants() -> Vec<StableFailureV1> {
        let root = StablePathV1::root();
        vec![
            StableFailureV1::BridgeCaptureInvalid,
            StableFailureV1::BridgeRequestTooLarge {
                limit_bytes: 1,
                actual_bytes: 2,
            },
            StableFailureV1::CodecInvalidUtf8,
            StableFailureV1::CodecInvalidJson,
            StableFailureV1::CodecInvalidShape {
                path: root.clone(),
                violation: ShapeViolationV1::MissingField,
            },
            StableFailureV1::ContractUnsupportedApiVersion {
                supported_version: 1,
            },
            StableFailureV1::ContractUnsupportedProtocolVersion {
                supported_version: 1,
            },
            StableFailureV1::ScoreUnsupportedSchema {
                supported_schema: ScoreSchemaVersionV1::VALUE,
            },
            StableFailureV1::ScoreInvalidStructure {
                path: root.clone(),
                violation: ScoreStructureViolationV1::InvalidValue,
            },
            StableFailureV1::CodecDepthLimit {
                limit: 64,
                actual: 65,
            },
            StableFailureV1::CodecPropertyLimit {
                limit: 1_048_576,
                actual: 1_048_577,
            },
            StableFailureV1::CodecNumberOutOfRange { path: root },
            StableFailureV1::BridgeHandleUnknown,
            StableFailureV1::BridgeHandleStale,
            StableFailureV1::BridgeHandleWrongEnvironment,
            StableFailureV1::BridgeHandleWrongThread,
            StableFailureV1::BridgeHandleReentrant,
            StableFailureV1::BridgeHandleBusy,
            StableFailureV1::BridgeHandlePoisoned,
            StableFailureV1::BridgeResponseTooLarge {
                limit_bytes: 1,
                actual_bytes: 2,
            },
            StableFailureV1::BridgePanicContained,
            StableFailureV1::BridgeInternal,
        ]
    }

    #[test]
    fn stable_failure_union_has_exactly_twenty_two_unique_codes_and_no_open_keys() {
        let variants = failure_variants();
        assert_eq!(variants.len(), 22);
        let codes = variants
            .iter()
            .map(StableFailureV1::code)
            .collect::<BTreeSet<_>>();
        assert_eq!(codes.len(), 22);
        for failure in variants {
            let bytes = serde_json::to_vec(&failure).expect("failure encode");
            let value: Value = serde_json::from_slice(&bytes).expect("failure JSON");
            let object = value.as_object().expect("failure object");
            assert_eq!(object["failureVersion"], 1);
            assert_eq!(object["code"], failure.code());
            assert!(!object.contains_key("message"));
            assert!(!object.contains_key("stack"));
            assert!(!object.contains_key("cause"));
        }
    }

    #[test]
    fn canonical_result_key_order_and_bytes_are_frozen() {
        let created = KernelSessionCreateResultV1::Created(KernelSessionCreateSuccessValueV1 {
            document_id: StableId::new("score-rkp1").expect("document id"),
            document_version: DocumentVersionV1::initial(),
        });
        assert_eq!(
            encode_create_result(&created).expect("created bytes"),
            br#"{"apiVersion":1,"status":"created","value":{"documentId":"score-rkp1","documentVersion":0}}"#
        );
        let rejected = KernelSessionCreateResultV1::Rejected(StableFailureV1::CodecInvalidUtf8);
        assert_eq!(
            encode_create_result(&rejected).expect("rejected bytes"),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-utf8"}}"#
        );
    }

    #[test]
    fn strict_request_decode_accepts_only_the_smoke_contract() {
        let decoded = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("smoke request");
        assert_eq!(decoded.api_version, 1);
        assert_eq!(decoded.document.id.as_str(), "score-rkp1");

        assert_eq!(
            decode_create_request(&[0xff]),
            Err(StableFailureV1::CodecInvalidUtf8)
        );
        assert_eq!(
            decode_create_request(b"{} {}"),
            Err(StableFailureV1::CodecInvalidJson)
        );
        assert!(matches!(
            decode_create_request(br#"{"apiVersion":1,"apiVersion":1,"document":{}}"#),
            Err(StableFailureV1::CodecInvalidShape {
                violation: ShapeViolationV1::DuplicateField,
                ..
            })
        ));
        assert!(matches!(
            decode_create_request(br#"{"apiVersion":1,"document":{},"extra":true}"#),
            Err(StableFailureV1::CodecInvalidShape {
                violation: ShapeViolationV1::ExtraField,
                ..
            })
        ));
    }

    #[test]
    fn first_failure_precedence_is_stable() {
        let over_cap = vec![0xff; REQUEST_BYTE_LIMIT + 1];
        assert!(matches!(
            decode_create_request(&over_cap),
            Err(StableFailureV1::BridgeRequestTooLarge { .. })
        ));

        let api_and_schema = SMOKE_REQUEST
            .replacen(r#""apiVersion":1"#, r#""apiVersion":2"#, 1)
            .replacen("brilliant-score-1", "brilliant-score-2", 1);
        assert_eq!(
            decode_create_request(api_and_schema.as_bytes()),
            Err(StableFailureV1::ContractUnsupportedApiVersion {
                supported_version: 1
            })
        );

        let future_schema = SMOKE_REQUEST.replacen("brilliant-score-1", "brilliant-score-2", 1);
        assert!(matches!(
            decode_create_request(future_schema.as_bytes()),
            Err(StableFailureV1::ScoreUnsupportedSchema { .. })
        ));
    }

    #[test]
    fn depth_property_and_number_limits_precede_shape() {
        let nested = format!(
            "{}0{}",
            "[".repeat(JSON_DEPTH_LIMIT),
            "]".repeat(JSON_DEPTH_LIMIT)
        );
        assert_eq!(
            decode_create_request(nested.as_bytes()),
            Err(StableFailureV1::CodecDepthLimit {
                limit: JSON_DEPTH_LIMIT as u64,
                actual: JSON_DEPTH_LIMIT as u64 + 1,
            })
        );
        assert!(matches!(
            decode_create_request(b"9007199254740992"),
            Err(StableFailureV1::CodecNumberOutOfRange { .. })
        ));

        let mut too_many = String::with_capacity(JSON_PROPERTY_LIMIT * 2 + 2);
        too_many.push('[');
        for index in 0..JSON_PROPERTY_LIMIT {
            if index != 0 {
                too_many.push(',');
            }
            too_many.push('0');
        }
        too_many.push(']');
        assert_eq!(
            decode_create_request(too_many.as_bytes()),
            Err(StableFailureV1::CodecPropertyLimit {
                limit: JSON_PROPERTY_LIMIT as u64,
                actual: JSON_PROPERTY_LIMIT as u64 + 1,
            })
        );
    }

    #[test]
    fn protocol_version_has_its_own_closed_failure() {
        assert_eq!(validate_protocol_version(1), Ok(()));
        assert_eq!(
            validate_protocol_version(2),
            Err(StableFailureV1::ContractUnsupportedProtocolVersion {
                supported_version: 1
            })
        );
    }
}
