use std::{collections::BTreeMap, fmt, marker::PhantomData};

use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{self, MapAccess, SeqAccess, Visitor},
    ser::{SerializeMap, SerializeSeq},
};

use crate::{CoreTypeFailure, FiniteNumber, JS_SAFE_INTEGER_MAX, JsString};

pub const JSON_DEPTH_LIMIT: usize = 64;
pub const JSON_PROPERTY_LIMIT: usize = 1_572_864;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum JsonValue<Text> {
    Null,
    Bool(bool),
    Number(FiniteNumber),
    String(Text),
    Array(Vec<Self>),
    Object(BTreeMap<Text, Self>),
}

/// Legacy UTF-8 instantiation, retaining its ordinary Serde conversions.
pub type BoundedJsonValue = JsonValue<String>;
/// The same bounded tree with lossless JavaScript string values and keys.
/// Non-scalar text requires the explicit lossless codec; ordinary Serde fails
/// closed rather than changing its JSON type or replacing any code units.
pub type LosslessJsonValue = JsonValue<JsString>;

impl<Text> JsonValue<Text> {
    pub fn validate_limits(&self) -> Result<(), CoreTypeFailure> {
        Self::validate_stack(vec![(self, 1_usize)], 0)
    }

    pub fn validate_object_limits(values: &BTreeMap<Text, Self>) -> Result<(), CoreTypeFailure> {
        Self::validate_stack(values.values().rev().map(|value| (value, 2)).collect(), 1)
    }

    fn validate_stack(
        mut stack: Vec<(&Self, usize)>,
        mut count: usize,
    ) -> Result<(), CoreTypeFailure> {
        while let Some((value, depth)) = stack.pop() {
            if depth > JSON_DEPTH_LIMIT {
                return Err(CoreTypeFailure::JsonDepthLimit { actual: depth });
            }
            count = count.saturating_add(1);
            if count > JSON_PROPERTY_LIMIT {
                return Err(CoreTypeFailure::JsonPropertyLimit { actual: count });
            }
            match value {
                Self::Array(values) => {
                    stack.extend(values.iter().rev().map(|value| (value, depth + 1)));
                }
                Self::Object(values) => {
                    stack.extend(values.values().rev().map(|value| (value, depth + 1)));
                }
                Self::Null | Self::Bool(_) | Self::Number(_) | Self::String(_) => {}
            }
        }
        Ok(())
    }
}

impl<Text: Serialize> Serialize for JsonValue<Text> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Null => serializer.serialize_unit(),
            Self::Bool(value) => serializer.serialize_bool(*value),
            Self::Number(value) => value.serialize(serializer),
            Self::String(value) => value.serialize(serializer),
            Self::Array(values) => {
                let mut sequence = serializer.serialize_seq(Some(values.len()))?;
                for value in values {
                    sequence.serialize_element(value)?;
                }
                sequence.end()
            }
            Self::Object(values) => {
                let mut map = serializer.serialize_map(Some(values.len()))?;
                for (key, value) in values {
                    map.serialize_entry(key, value)?;
                }
                map.end()
            }
        }
    }
}

struct BoundedJsonVisitor<Text>(PhantomData<Text>);

impl<'de, Text: Deserialize<'de> + From<String> + Ord> Visitor<'de> for BoundedJsonVisitor<Text> {
    type Value = JsonValue<Text>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("bounded data-only JSON")
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(JsonValue::Null)
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(JsonValue::Null)
    }

    fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E> {
        Ok(JsonValue::Bool(value))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_f64(value as f64)
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_f64(value as f64)
    }

    fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        FiniteNumber::new(value)
            .map(JsonValue::Number)
            .map_err(|_| E::custom("non-finite JSON number"))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(JsonValue::String(Text::from(value.to_owned())))
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E> {
        Ok(JsonValue::String(Text::from(value)))
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element()? {
            values.push(value);
        }
        Ok(JsonValue::Array(values))
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut values = BTreeMap::new();
        while let Some((key, value)) = map.next_entry()? {
            if values.insert(key, value).is_some() {
                return Err(de::Error::custom("duplicate JSON key"));
            }
        }
        Ok(JsonValue::Object(values))
    }
}

impl<'de, Text: Deserialize<'de> + From<String> + Ord> Deserialize<'de> for JsonValue<Text> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = deserializer.deserialize_any(BoundedJsonVisitor::<Text>(PhantomData))?;
        value
            .validate_limits()
            .map_err(|_| de::Error::custom("bounded JSON resource limit"))?;
        Ok(value)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StablePathSegmentV1 {
    Field(String),
    Index(u64),
}

impl Serialize for StablePathSegmentV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Field(value) => serializer.serialize_str(value),
            Self::Index(value) => serializer.serialize_u64(*value),
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(transparent)]
pub struct StablePathV1(Vec<StablePathSegmentV1>);

impl StablePathV1 {
    pub fn segments(&self) -> &[StablePathSegmentV1] {
        &self.0
    }
    pub fn new(segments: Vec<StablePathSegmentV1>) -> Result<Self, CoreTypeFailure> {
        if segments.len() > JSON_DEPTH_LIMIT
            || segments.iter().any(|segment| match segment {
                StablePathSegmentV1::Field(value) => value.is_empty() || value.len() > 128,
                StablePathSegmentV1::Index(value) => *value > JS_SAFE_INTEGER_MAX as u64,
            })
        {
            return Err(CoreTypeFailure::InvalidStablePath);
        }
        Ok(Self(segments))
    }

    pub fn root() -> Self {
        Self::default()
    }

    pub fn field(field: &'static str) -> Self {
        Self(vec![StablePathSegmentV1::Field(field.to_owned())])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OLD_JSON_PROPERTY_LIMIT: usize = 1_048_576;

    fn array_with_total_value_count(total: usize) -> BoundedJsonValue {
        assert!(total >= 1);
        BoundedJsonValue::Array(vec![BoundedJsonValue::Null; total - 1])
    }

    #[test]
    fn object_keys_are_lexical() {
        let value = BoundedJsonValue::Object(std::collections::BTreeMap::from([
            ("z".to_owned(), BoundedJsonValue::Null),
            ("a".to_owned(), BoundedJsonValue::Bool(true)),
        ]));
        let BoundedJsonValue::Object(object) = value else {
            panic!("expected object");
        };
        assert_eq!(object.keys().cloned().collect::<Vec<_>>(), ["a", "z"]);
    }

    #[test]
    fn depth_limit_is_inclusive() {
        let mut within = BoundedJsonValue::Null;
        for _ in 1..JSON_DEPTH_LIMIT {
            within = BoundedJsonValue::Array(vec![within]);
        }
        assert_eq!(within.validate_limits(), Ok(()));
        let beyond = BoundedJsonValue::Array(vec![within]);
        assert_eq!(
            beyond.validate_limits(),
            Err(CoreTypeFailure::JsonDepthLimit {
                actual: JSON_DEPTH_LIMIT + 1
            })
        );
    }

    #[test]
    fn property_limit_compatibility_migration_is_inclusive() {
        assert_eq!(JSON_PROPERTY_LIMIT, 1_572_864);

        for total in [
            OLD_JSON_PROPERTY_LIMIT,
            OLD_JSON_PROPERTY_LIMIT + 1,
            JSON_PROPERTY_LIMIT - 1,
            JSON_PROPERTY_LIMIT,
        ] {
            let value = array_with_total_value_count(total);
            assert_eq!(value.validate_limits(), Ok(()), "total={total}");
        }
    }

    #[test]
    fn property_limit_reports_the_first_value_above_the_successor_cap() {
        let value = array_with_total_value_count(JSON_PROPERTY_LIMIT + 1);
        assert_eq!(
            value.validate_limits(),
            Err(CoreTypeFailure::JsonPropertyLimit { actual: 1_572_865 })
        );
    }

    #[test]
    fn stable_paths_reject_dynamic_or_unbounded_segments() {
        assert!(StablePathV1::new(vec![StablePathSegmentV1::Field(String::new())]).is_err());
        assert!(
            StablePathV1::new(vec![StablePathSegmentV1::Index(
                JS_SAFE_INTEGER_MAX as u64 + 1
            )])
            .is_err()
        );
    }
}
