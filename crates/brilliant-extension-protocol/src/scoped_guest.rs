//! Optional codecs for the private scoped Wasm V1 transport.
//!
//! Borrow the complete Core JSON instead of allocating a dynamic object for
//! every note at every callback. This is a guest convenience, not a projection,
//! schema validator, or authority to read another contribution's extensions.
use std::borrow::Cow;
use std::fmt;
use std::marker::PhantomData;

use serde::{
    Deserialize,
    de::{self, DeserializeSeed, MapAccess, Visitor},
};
use serde_json::{Value, value::RawValue};

mod json;
use json::PlainValue;

/// The host still sends the complete Core document. A plugin can deserialize
/// only the fields its operation needs, or deserialize the entire Core value.
/// The borrowed JSON preserves numeric spelling and escaped UTF-16 verbatim.
/// Choose `C` to parse a typed Core shape in the same streaming pass; the default
/// retains the entire Core as borrowed JSON for optional later decoding.
#[derive(Debug, Deserialize)]
#[serde(
    rename_all = "camelCase",
    deny_unknown_fields,
    bound(deserialize = "C: Deserialize<'de>")
)]
pub struct ScopedContributionReadViewV1<'a, C = &'a RawValue> {
    #[serde(deserialize_with = "view_version")]
    pub view_version: u32,
    #[serde(borrow)]
    pub document_id: Cow<'a, str>,
    #[serde(borrow)]
    pub schema_version: Cow<'a, str>,
    pub document_version: u64,
    pub core_document: C,
    #[serde(deserialize_with = "plain_values")]
    pub compatible_extensions: Vec<Value>,
    /// Present only when the authenticated catalog declares cross-plugin reads.
    #[serde(default, deserialize_with = "plain_values")]
    pub dependency_reads: Vec<Value>,
}

impl<'a> ScopedContributionReadViewV1<'a> {
    /// Parse the requested shape without changing the complete borrowed input.
    /// Plugins remain responsible for their semantic checks. This codec does
    /// not change host validation, fuel, transfer, or allocation limits.
    pub fn read_core<T: Deserialize<'a>>(&self) -> serde_json::Result<T> {
        serde_json::from_str(self.core_document.get())
    }

    /// Dynamic Core decoding that preserves literal keys and negative zero. Prefer
    /// this to `read_core::<serde_json::Value>()`: serde_json's raw_value feature
    /// gives private marker keys special meaning in its Value deserializer.
    pub fn read_core_value(&self) -> serde_json::Result<Value> {
        serde_json::from_str::<PlainValue>(self.core_document.get()).map(|value| value.0)
    }
}

fn view_version<'de, D: de::Deserializer<'de>>(deserializer: D) -> Result<u32, D::Error> {
    let version = u32::deserialize(deserializer)?;
    if version == 1 {
        Ok(version)
    } else {
        Err(de::Error::custom("unsupported view version"))
    }
}

#[derive(Debug, Deserialize)]
#[serde(
    rename_all = "camelCase",
    deny_unknown_fields,
    bound(deserialize = "C: Deserialize<'de>")
)]
pub struct ScopedEffectApplyInputV1<'a, C = &'a RawValue> {
    #[serde(borrow)]
    pub view: ScopedContributionReadViewV1<'a, C>,
    #[serde(deserialize_with = "plain_value")]
    pub owner: Value,
    #[serde(default, deserialize_with = "plain_optional_value")]
    pub current_block: Option<Value>,
    #[serde(deserialize_with = "plain_value")]
    pub payload: Value,
}

fn plain_value<'de, D: de::Deserializer<'de>>(deserializer: D) -> Result<Value, D::Error> {
    Ok(PlainValue::deserialize(deserializer)?.0)
}
fn plain_values<'de, D: de::Deserializer<'de>>(deserializer: D) -> Result<Vec<Value>, D::Error> {
    Ok(Vec::<PlainValue>::deserialize(deserializer)?
        .into_iter()
        .map(|value| value.0)
        .collect())
}
fn plain_optional_value<'de, D: de::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Value>, D::Error> {
    Ok(Option::<PlainValue>::deserialize(deserializer)?.map(|value| value.0))
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Operation {
    CommandDecode,
    CommandPrepare,
    EffectDecode,
    EffectTransform,
    Validate,
    Classify,
}

#[derive(Debug)]
pub enum ScopedCallbackArgumentsV1<'a, C = &'a RawValue> {
    CommandDecode(Value),
    CommandPrepare(ScopedContributionReadViewV1<'a, C>, Value),
    EffectDecode(Value),
    EffectTransform(ScopedEffectApplyInputV1<'a, C>),
    Validate(ScopedContributionReadViewV1<'a, C>),
    Classify(ScopedContributionReadViewV1<'a, C>),
}

struct ArgumentsSeed<C>(Operation, PhantomData<C>);
impl<'de, C: Deserialize<'de>> DeserializeSeed<'de> for ArgumentsSeed<C> {
    type Value = ScopedCallbackArgumentsV1<'de, C>;

    fn deserialize<D: de::Deserializer<'de>>(
        self,
        deserializer: D,
    ) -> Result<Self::Value, D::Error> {
        use ScopedCallbackArgumentsV1 as Args;
        Ok(match self.0 {
            Operation::CommandDecode => {
                let (PlainValue(value),) = Deserialize::deserialize(deserializer)?;
                Args::CommandDecode(value)
            }
            Operation::CommandPrepare => {
                let (view, PlainValue(value)) = Deserialize::deserialize(deserializer)?;
                Args::CommandPrepare(view, value)
            }
            Operation::EffectDecode => {
                let (PlainValue(value),) = Deserialize::deserialize(deserializer)?;
                Args::EffectDecode(value)
            }
            Operation::EffectTransform => {
                let (value,) = Deserialize::deserialize(deserializer)?;
                Args::EffectTransform(value)
            }
            Operation::Validate => {
                let (view,) = Deserialize::deserialize(deserializer)?;
                Args::Validate(view)
            }
            Operation::Classify => {
                let (view,) = Deserialize::deserialize(deserializer)?;
                Args::Classify(view)
            }
        })
    }
}

/// Decode each callback in one pass when the operation precedes its arguments,
/// as emitted by the current host. Reordered JSON remains accepted: arguments
/// encountered first are borrowed and decoded after the operation is known.
/// Identity is data, not authentication; the host remains the authority.
#[derive(Debug)]
pub struct ScopedCallbackRequestV1<'a, C = &'a RawValue> {
    pub module_id: String,
    pub contribution_id: String,
    pub definition_id: Option<String>,
    pub arguments: ScopedCallbackArgumentsV1<'a, C>,
}

impl<'de, C: Deserialize<'de>> Deserialize<'de> for ScopedCallbackRequestV1<'de, C> {
    fn deserialize<D: de::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(field_identifier, rename_all = "camelCase")]
        enum Field {
            CallbackVersion,
            ModuleId,
            ContributionId,
            DefinitionId,
            Operation,
            Arguments,
        }
        struct RequestVisitor<C>(PhantomData<C>);
        impl<'de, C: Deserialize<'de>> Visitor<'de> for RequestVisitor<C> {
            type Value = ScopedCallbackRequestV1<'de, C>;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a scoped callback V1 request")
            }
            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                let (mut version, mut module, mut contribution, mut definition, mut operation) =
                    (None, None, None, None, None);
                let (mut arguments, mut pending): (Option<_>, Option<&'de RawValue>) = (None, None);
                while let Some(field) = map.next_key()? {
                    match field {
                        Field::CallbackVersion => {
                            set(&mut version, map.next_value::<u32>()?, "callbackVersion")?
                        }
                        Field::ModuleId => set(&mut module, map.next_value()?, "moduleId")?,
                        Field::ContributionId => {
                            set(&mut contribution, map.next_value()?, "contributionId")?
                        }
                        Field::DefinitionId => set(
                            &mut definition,
                            map.next_value::<Option<String>>()?,
                            "definitionId",
                        )?,
                        Field::Operation => {
                            set(&mut operation, map.next_value::<Operation>()?, "operation")?
                        }
                        Field::Arguments => {
                            if arguments.is_some() || pending.is_some() {
                                return Err(de::Error::duplicate_field("arguments"));
                            }
                            if let Some(operation) = operation {
                                arguments =
                                    Some(map.next_value_seed(ArgumentsSeed::<C>(
                                        operation,
                                        PhantomData,
                                    ))?);
                            } else {
                                pending = Some(map.next_value()?);
                            }
                        }
                    }
                }
                if version != Some(1) {
                    return Err(de::Error::custom("unsupported callback version"));
                }
                let operation = operation.ok_or_else(|| de::Error::missing_field("operation"))?;
                if let Some(raw) = pending {
                    let mut deserializer = serde_json::Deserializer::from_str(raw.get());
                    arguments = Some(
                        ArgumentsSeed::<C>(operation, PhantomData)
                            .deserialize(&mut deserializer)
                            .map_err(de::Error::custom)?,
                    );
                }
                Ok(ScopedCallbackRequestV1 {
                    module_id: module.ok_or_else(|| de::Error::missing_field("moduleId"))?,
                    contribution_id: contribution
                        .ok_or_else(|| de::Error::missing_field("contributionId"))?,
                    definition_id: definition
                        .ok_or_else(|| de::Error::missing_field("definitionId"))?,
                    arguments: arguments.ok_or_else(|| de::Error::missing_field("arguments"))?,
                })
            }
        }
        deserializer.deserialize_map(RequestVisitor::<C>(PhantomData))
    }
}

fn set<T, E: de::Error>(slot: &mut Option<T>, value: T, field: &'static str) -> Result<(), E> {
    if slot.replace(value).is_some() {
        Err(de::Error::duplicate_field(field))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VIEW: &str = r#"{"viewVersion":1,"documentId":"score-1","schemaVersion":"brilliant-score-1","documentVersion":7,"coreDocument":{ "metadata":{"title":"\ud800"},"number":-0,"future":[{"keep":true}],"parts":[{"id":"part-1"}]},"compatibleExtensions":[]}"#;

    #[test]
    fn complete_core_is_borrowed_verbatim_and_typed_reads_are_optional() {
        #[derive(Deserialize)]
        struct Core<'a> {
            #[serde(borrow)]
            parts: Vec<Part<'a>>,
        }
        #[derive(Deserialize)]
        struct Part<'a> {
            id: &'a str,
        }
        let view: ScopedContributionReadViewV1<'_> = serde_json::from_str(VIEW).unwrap();
        let raw = view.core_document.get();
        assert!(raw.starts_with(r#"{ "metadata""#));
        assert!(raw.contains(r#""title":"\ud800""#));
        assert!(raw.contains(r#""number":-0"#));
        assert!(raw.contains(r#""future":[{"keep":true}]"#));
        assert!(raw.as_ptr() >= VIEW.as_ptr());
        assert!((raw.as_ptr() as usize + raw.len()) <= VIEW.as_ptr() as usize + VIEW.len());
        let core: Core<'_> = view.read_core().unwrap();
        assert_eq!(core.parts[0].id, "part-1");
        // Full deserialization still reports the unsupported surrogate. The
        // borrowed representation does not replace it or pretend to decode it.
        assert!(view.read_core::<Value>().is_err());
        assert!(view.dependency_reads.is_empty());
    }

    #[test]
    fn decoded_fields_and_explicit_dependency_views_are_preserved() {
        let input = VIEW.replace(r#"score-1"#, r#"score-\u0031"#).replace(
            r#""compatibleExtensions":[]"#,
            r#""compatibleExtensions":[{"namespace":"owned","payload":{"marker":"own"}}],"dependencyReads":[{"namespace":"provider","blocks":[{"payload":{"marker":"dependency"}}]}]"#,
        );
        let view: ScopedContributionReadViewV1<'_> = serde_json::from_str(&input).unwrap();
        assert_eq!(view.document_id, "score-1");
        assert_eq!(view.document_version, 7);
        assert_eq!(view.compatible_extensions[0]["payload"]["marker"], "own");
        assert_eq!(
            view.dependency_reads[0]["blocks"][0]["payload"]["marker"],
            "dependency"
        );
    }

    #[test]
    fn malformed_core_and_transport_shapes_still_fail() {
        for input in [
            VIEW.replace(r#""number":-0"#, r#""number":tru"#),
            VIEW.replace(r#""viewVersion":1"#, r#""viewVersion":1,"viewVersion":1"#),
            VIEW.replace(r#""coreDocument":"#, r#""wrongField":"#),
            VIEW.replace(r#""viewVersion":1"#, r#""viewVersion":2"#),
            format!("{VIEW} trailing"),
        ] {
            assert!(serde_json::from_str::<ScopedContributionReadViewV1<'_>>(&input).is_err());
        }
    }

    fn request(operation: &str, arguments: &str, reordered: bool) -> String {
        let header = r#""callbackVersion":1,"moduleId":"fixture.score.module","contributionId":"fixture.score.contribution.v1","definitionId":null"#;
        if reordered {
            format!(r#"{{"arguments":{arguments},"operation":"{operation}",{header}}}"#)
        } else {
            format!(r#"{{{header},"operation":"{operation}","arguments":{arguments}}}"#)
        }
    }

    #[test]
    fn each_callback_decodes_in_either_field_order_and_preserves_the_full_view() {
        for (operation, arguments) in [
            (
                "commandDecode",
                r#"[{"target":{},"payload":{"noteId":"note-1"}}]"#.to_owned(),
            ),
            (
                "commandPrepare",
                format!("[{VIEW},{{\"marker\":\"dynamic\"}}]"),
            ),
            ("effectDecode", "[{\"marker\":\"dynamic\"}]".to_owned()),
            (
                "effectTransform",
                format!("[{{\"view\":{VIEW},\"owner\":{{\"kind\":\"score\"}},\"payload\":{{}}}}]"),
            ),
            ("validate", format!("[{VIEW}]")),
            ("classify", format!("[{VIEW}]")),
        ] {
            let normal = request(operation, &arguments, false);
            let reordered = request(operation, &arguments, true);
            let first: ScopedCallbackRequestV1<'_> = serde_json::from_str(&normal).unwrap();
            let second: ScopedCallbackRequestV1<'_> = serde_json::from_str(&reordered).unwrap();
            assert_eq!(format!("{first:?}"), format!("{second:?}"));
            assert_eq!(first.module_id, "fixture.score.module");
            assert_eq!(first.definition_id, None);
            match first.arguments {
                ScopedCallbackArgumentsV1::CommandPrepare(view, _)
                | ScopedCallbackArgumentsV1::Validate(view)
                | ScopedCallbackArgumentsV1::Classify(view) => assert!(
                    view.core_document
                        .get()
                        .contains(r#""future":[{"keep":true}]"#)
                ),
                ScopedCallbackArgumentsV1::EffectTransform(input) => {
                    assert!(input.view.core_document.get().contains(r#""number":-0"#))
                }
                _ => {}
            }
        }
    }

    #[test]
    fn request_versions_duplicates_unknown_fields_and_argument_arity_are_rejected() {
        let valid = request("commandPrepare", &format!("[{VIEW},{{}}]"), false);
        for input in [
            valid.replace(r#""callbackVersion":1"#, r#""callbackVersion":2"#),
            valid.replace(r#""operation":"commandPrepare""#, r#""operation":"other""#),
            valid.replace(
                r#""definitionId":null"#,
                r#""definitionId":null,"definitionId":null"#,
            ),
            valid.replace(r#""moduleId":"fixture.score.module""#, r#""extra":true"#),
            valid.replace(r#","definitionId":null"#, ""),
            valid.replace(r#""arguments":["#, r#""arguments":[],"arguments":["#),
            request("commandPrepare", &format!("[{VIEW}]"), false),
            request("commandPrepare", &format!("[{VIEW},{{}},{{}}]"), false),
            request("effectTransform", "[{}]", true),
        ] {
            assert!(
                serde_json::from_str::<ScopedCallbackRequestV1<'_>>(&input).is_err(),
                "{input}"
            );
        }
    }

    #[test]
    fn typed_core_can_be_read_during_the_request_pass_in_both_field_orders() {
        #[derive(Debug, Deserialize)]
        struct Core {
            parts: Vec<Part>,
        }
        #[derive(Debug, Deserialize)]
        struct Part {
            id: String,
        }
        for reordered in [false, true] {
            let input = request("commandPrepare", &format!("[{VIEW},{{}}]"), reordered);
            let request: ScopedCallbackRequestV1<'_, Core> = serde_json::from_str(&input).unwrap();
            let ScopedCallbackArgumentsV1::CommandPrepare(view, _) = request.arguments else {
                panic!("wrong operation");
            };
            assert_eq!(view.core_document.parts[0].id, "part-1");
        }
    }

    #[test]
    fn user_json_marker_keys_are_not_reinterpreted_as_serde_raw_values() {
        let payload = r#"{"$serde_json::private::RawValue":"true","nested":{"$serde_json::private::RawValue":"null"},"negativeZero":-0}"#;
        for operation in ["commandDecode", "effectDecode"] {
            let input = request(operation, &format!("[{payload}]"), false);
            let request: ScopedCallbackRequestV1<'_> = serde_json::from_str(&input).unwrap();
            let (ScopedCallbackArgumentsV1::CommandDecode(value)
            | ScopedCallbackArgumentsV1::EffectDecode(value)) = request.arguments
            else {
                panic!("wrong operation");
            };
            assert_eq!(value["$serde_json::private::RawValue"], "true");
            assert_eq!(value["nested"]["$serde_json::private::RawValue"], "null");
            assert!(value["negativeZero"].as_f64().unwrap().is_sign_negative());
        }
        let input = VIEW.replace(
            r#""compatibleExtensions":[]"#,
            &format!(r#""compatibleExtensions":[{payload}],"dependencyReads":[{payload}]"#),
        );
        let view: ScopedContributionReadViewV1<'_> = serde_json::from_str(&input).unwrap();
        for value in [&view.compatible_extensions[0], &view.dependency_reads[0]] {
            assert_eq!(value["$serde_json::private::RawValue"], "true");
            assert_eq!(value["nested"]["$serde_json::private::RawValue"], "null");
        }
        let transform = request(
            "effectTransform",
            &format!(
                "[{{\"view\":{input},\"owner\":{payload},\"currentBlock\":{payload},\"payload\":{payload}}}]"
            ),
            false,
        );
        let request: ScopedCallbackRequestV1<'_> = serde_json::from_str(&transform).unwrap();
        let ScopedCallbackArgumentsV1::EffectTransform(value) = request.arguments else {
            panic!("wrong operation");
        };
        for value in [
            &value.owner,
            value.current_block.as_ref().unwrap(),
            &value.payload,
        ] {
            assert_eq!(value["$serde_json::private::RawValue"], "true");
        }
        let core = format!(
            r#"{{"viewVersion":1,"documentId":"score-1","schemaVersion":"brilliant-score-1","documentVersion":0,"coreDocument":{payload},"compatibleExtensions":[]}}"#
        );
        let view: ScopedContributionReadViewV1<'_> = serde_json::from_str(&core).unwrap();
        assert_eq!(
            view.read_core_value().unwrap()["nested"]["$serde_json::private::RawValue"],
            "null"
        );
    }
}
