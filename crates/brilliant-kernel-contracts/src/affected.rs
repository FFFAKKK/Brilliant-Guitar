use std::sync::Arc;

use brilliant_core_types::StableId;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Result addresses can name transient/deleted candidate entities with empty
/// IDs. They are never command targets or live Store identities.
#[derive(Clone, Debug)]
pub struct AffectedEntityIdV1(Storage);

#[derive(Clone, Debug)]
enum Storage {
    Stable(StableId),
    Raw(Arc<str>),
}

impl AffectedEntityIdV1 {
    pub fn as_str(&self) -> &str {
        match &self.0 {
            Storage::Stable(value) => value.as_str(),
            Storage::Raw(value) => value,
        }
    }
}

impl From<StableId> for AffectedEntityIdV1 {
    fn from(value: StableId) -> Self {
        Self(Storage::Stable(value))
    }
}

impl From<String> for AffectedEntityIdV1 {
    fn from(value: String) -> Self {
        Self(Storage::Raw(value.into()))
    }
}

impl From<Arc<str>> for AffectedEntityIdV1 {
    fn from(value: Arc<str>) -> Self {
        Self(Storage::Raw(value))
    }
}

impl PartialEq for AffectedEntityIdV1 {
    fn eq(&self, other: &Self) -> bool {
        self.as_str() == other.as_str()
    }
}

impl Eq for AffectedEntityIdV1 {}

impl Serialize for AffectedEntityIdV1 {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for AffectedEntityIdV1 {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        String::deserialize(deserializer).map(Self::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AffectedEntityAddressV1, ScoreEntityTargetV1};

    #[test]
    fn raw_result_addresses_keep_empty_strings_while_command_targets_stay_nonempty() {
        for (kind, field) in [
            ("document", "documentId"),
            ("measure", "measureId"),
            ("part", "partId"),
            ("staff", "staffId"),
            ("voice", "voiceId"),
            ("event", "eventId"),
            ("note", "noteId"),
        ] {
            for value in ["", "线路/🎸/e\u{301}/\0"] {
                let wire = serde_json::json!({ "kind": kind, field: value });
                let result: AffectedEntityAddressV1 = serde_json::from_value(wire.clone()).unwrap();
                assert_eq!(serde_json::to_value(result).unwrap(), wire);
                assert_eq!(
                    serde_json::from_value::<ScoreEntityTargetV1>(wire).is_ok(),
                    !value.is_empty()
                );
            }
            for value in [
                serde_json::Value::Null,
                serde_json::json!(0),
                serde_json::json!(false),
                serde_json::json!([]),
                serde_json::json!({}),
            ] {
                let wire = serde_json::json!({ "kind": kind, field: value });
                assert!(serde_json::from_value::<AffectedEntityAddressV1>(wire.clone()).is_err());
                assert!(serde_json::from_value::<ScoreEntityTargetV1>(wire).is_err());
            }
            assert!(
                serde_json::from_value::<AffectedEntityAddressV1>(
                    serde_json::json!({ "kind": kind, field: "", "extra": 1 })
                )
                .is_err()
            );
            assert!(
                serde_json::from_value::<AffectedEntityAddressV1>(
                    serde_json::json!({ "kind": kind })
                )
                .is_err()
            );
        }
    }

    #[test]
    fn affected_ids_share_stable_and_raw_text_and_compare_by_content() {
        let text = "long-result-id/🎸/".repeat(4096);
        let stable = StableId::new(text.clone()).unwrap();
        let allocation = stable.as_str().as_ptr();
        let from_stable = AffectedEntityIdV1::from(stable);
        assert_eq!(from_stable.as_str().as_ptr(), allocation);
        let raw: Arc<str> = text.clone().into();
        let raw_allocation = raw.as_ptr();
        let from_raw = AffectedEntityIdV1::from(raw);
        assert_eq!(from_raw.as_str().as_ptr(), raw_allocation);
        let from_string = AffectedEntityIdV1::from(text.clone());
        assert_eq!(from_stable, from_raw);
        assert_eq!(from_stable, from_string);
        for value in [from_stable, from_raw, from_string] {
            let pointer = value.as_str().as_ptr();
            let copies = vec![value.clone(); 256];
            drop(value);
            assert!(copies.iter().all(|copy| copy.as_str().as_ptr() == pointer));
            assert!(copies.iter().all(|copy| copy.as_str() == text));
            assert_eq!(
                serde_json::to_vec(&copies[0]).unwrap(),
                serde_json::to_vec(&text).unwrap()
            );
        }
    }
}
