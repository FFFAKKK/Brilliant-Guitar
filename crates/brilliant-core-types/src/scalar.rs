use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer, de};

use crate::CoreTypeFailure;

pub const API_VERSION_V1: u64 = 1;
pub const DOCUMENT_VERSION_INITIAL: u64 = 0;
pub const JS_SAFE_INTEGER_MAX: i64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct StableId(String);

impl StableId {
    pub fn new(value: impl Into<String>) -> Result<Self, CoreTypeFailure> {
        let value = value.into();
        if value.is_empty() {
            return Err(CoreTypeFailure::EmptyStableId);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Serialize for StableId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for StableId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::new(value).map_err(|_| de::Error::custom("invalid stable id"))
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SafeInteger(i64);

impl SafeInteger {
    pub fn new(value: i64) -> Result<Self, CoreTypeFailure> {
        if (-JS_SAFE_INTEGER_MAX..=JS_SAFE_INTEGER_MAX).contains(&value) {
            Ok(Self(value))
        } else {
            Err(CoreTypeFailure::NumberOutOfRange)
        }
    }

    pub const fn get(self) -> i64 {
        self.0
    }
}

impl Serialize for SafeInteger {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_i64(self.0)
    }
}

impl<'de> Deserialize<'de> for SafeInteger {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct SafeIntegerVisitor;

        impl de::Visitor<'_> for SafeIntegerVisitor {
            type Value = SafeInteger;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a JavaScript safe integer")
            }

            fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                SafeInteger::new(value).map_err(|_| E::custom("integer outside safe range"))
            }

            fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                i64::try_from(value)
                    .ok()
                    .and_then(|value| SafeInteger::new(value).ok())
                    .ok_or_else(|| E::custom("integer outside safe range"))
            }
        }

        deserializer.deserialize_any(SafeIntegerVisitor)
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(transparent)]
pub struct DocumentVersionV1(u64);

impl DocumentVersionV1 {
    pub const fn initial() -> Self {
        Self(DOCUMENT_VERSION_INITIAL)
    }

    pub const fn checked_next(self) -> Option<Self> {
        match self.0.checked_add(1) {
            Some(next) if next <= JS_SAFE_INTEGER_MAX as u64 => Some(Self(next)),
            _ => None,
        }
    }

    pub const fn get(self) -> u64 {
        self.0
    }
}

impl<'de> Deserialize<'de> for DocumentVersionV1 {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = u64::deserialize(deserializer)?;
        if value <= JS_SAFE_INTEGER_MAX as u64 {
            Ok(Self(value))
        } else {
            Err(de::Error::custom("document version outside safe range"))
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScoreSchemaVersionV1;

impl ScoreSchemaVersionV1 {
    pub const VALUE: &'static str = "brilliant-score-1";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_ids_and_safe_integers_are_closed() {
        assert_eq!(StableId::new(""), Err(CoreTypeFailure::EmptyStableId));
        assert_eq!(StableId::new("score").expect("valid id").as_str(), "score");
        assert!(SafeInteger::new(JS_SAFE_INTEGER_MAX).is_ok());
        assert!(SafeInteger::new(-JS_SAFE_INTEGER_MAX).is_ok());
        assert_eq!(
            SafeInteger::new(JS_SAFE_INTEGER_MAX + 1),
            Err(CoreTypeFailure::NumberOutOfRange)
        );
    }

    #[test]
    fn checked_document_version_increment_stays_inside_the_wire_safe_range() {
        assert_eq!(
            DocumentVersionV1::initial().checked_next(),
            Some(DocumentVersionV1(1))
        );
        assert_eq!(
            DocumentVersionV1(41).checked_next(),
            Some(DocumentVersionV1(42))
        );
        assert_eq!(
            DocumentVersionV1(JS_SAFE_INTEGER_MAX as u64 - 1).checked_next(),
            Some(DocumentVersionV1(JS_SAFE_INTEGER_MAX as u64))
        );
        assert_eq!(
            DocumentVersionV1(JS_SAFE_INTEGER_MAX as u64).checked_next(),
            None
        );
    }
}
