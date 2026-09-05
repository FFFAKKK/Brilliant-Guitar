use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer, de};

use crate::{CoreTypeFailure, JsString};

pub const API_VERSION_V1: u64 = 1;
pub const DOCUMENT_VERSION_INITIAL: u64 = 0;
pub const JS_SAFE_INTEGER_MAX: i64 = 9_007_199_254_740_991;

#[derive(Clone, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct StableId(JsString);

impl StableId {
    pub fn new(value: impl Into<JsString>) -> Result<Self, CoreTypeFailure> {
        let value = value.into();
        if value.is_empty() {
            return Err(CoreTypeFailure::EmptyStableId);
        }
        // Ownership routes and history can retain this ID many times. Share the
        // immutable text so a long parent ID does not multiply with child count.
        Ok(Self(value))
    }

    pub fn as_js_string(&self) -> &JsString {
        &self.0
    }
}

impl fmt::Debug for StableId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.0.to_utf8() {
            Ok(text) => formatter.debug_tuple("StableId").field(&text).finish(),
            Err(_) => formatter.debug_tuple("StableId").field(&self.0).finish(),
        }
    }
}

impl Serialize for StableId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.0.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for StableId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = JsString::deserialize(deserializer)?;
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

impl TryFrom<u64> for DocumentVersionV1 {
    type Error = CoreTypeFailure;
    fn try_from(value: u64) -> Result<Self, Self::Error> {
        if value <= JS_SAFE_INTEGER_MAX as u64 {
            Ok(Self(value))
        } else {
            Err(CoreTypeFailure::NumberOutOfRange)
        }
    }
}

impl<'de> Deserialize<'de> for DocumentVersionV1 {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = u64::deserialize(deserializer)?;
        Self::try_from(value).map_err(|_| de::Error::custom("document version outside safe range"))
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
    fn stable_id_clones_share_immutable_text_and_survive_the_original() {
        let text = "线路/🎸/e\u{301}/".repeat(4096);
        let original = StableId::new(text.clone()).unwrap();
        let allocation = original.as_js_string().code_units().as_ptr();
        let clones = vec![original.clone(); 256];
        assert!(
            clones
                .iter()
                .all(|value| value.as_js_string().code_units().as_ptr() == allocation),
            "cloning a stable ID must not multiply its retained UTF-16 code units"
        );
        drop(original);
        assert!(
            clones.iter().all(|value| value.as_js_string().code_units()
                == text.encode_utf16().collect::<Vec<_>>())
        );
        assert!(
            clones
                .iter()
                .all(|value| value.as_js_string().code_units().as_ptr() == allocation)
        );
    }

    #[test]
    fn stable_id_value_traits_constructor_inputs_and_thread_safety_are_preserved() {
        use std::{
            borrow::Cow,
            collections::{BTreeSet, HashMap},
        };
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<StableId>();
        let text = String::from("线路/🎸/e\u{301}/\0");
        let first = StableId::new(text.as_str()).unwrap();
        let second = StableId::new(text.clone()).unwrap();
        let borrowed = StableId::new(&text).unwrap();
        let cow = StableId::new(Cow::Borrowed(text.as_str())).unwrap();
        assert_eq!(first, second);
        assert_eq!(second, borrowed);
        assert_eq!(borrowed, cow);
        let mut values = HashMap::new();
        values.insert(first.clone(), 7);
        assert_eq!(values.get(&second), Some(&7));
        let mut ordered = BTreeSet::new();
        ordered.insert(first.clone());
        ordered.insert(second);
        ordered.insert(StableId::new("a").unwrap());
        assert_eq!(ordered.len(), 2);
        assert_eq!(
            ordered.first().unwrap().as_js_string(),
            &JsString::from("a")
        );
        assert_eq!(format!("{first:?}"), format!("StableId({text:?})"));
        let moved = first.clone();
        let thread = std::thread::spawn(move || moved.as_js_string().clone());
        drop(first);
        assert_eq!(thread.join().unwrap(), JsString::from(text));
    }

    #[test]
    fn stable_ids_and_safe_integers_are_closed() {
        assert_eq!(StableId::new(""), Err(CoreTypeFailure::EmptyStableId));
        assert_eq!(
            StableId::new("score").expect("valid id").as_js_string(),
            &JsString::from("score")
        );
        assert!(SafeInteger::new(JS_SAFE_INTEGER_MAX).is_ok());
        assert!(SafeInteger::new(-JS_SAFE_INTEGER_MAX).is_ok());
        assert_eq!(
            SafeInteger::new(JS_SAFE_INTEGER_MAX + 1),
            Err(CoreTypeFailure::NumberOutOfRange)
        );
    }

    #[test]
    fn stable_id_preserves_unpaired_units_and_uses_utf16_identity_order() {
        use std::collections::{BTreeSet, HashSet};

        assert_eq!(
            StableId::new(JsString::default()),
            Err(CoreTypeFailure::EmptyStableId)
        );
        let ordered_units = [
            vec![0],
            vec![0xd7ff],
            vec![0xd800],
            vec![0xd800, 0xdc00],
            vec![0xdc00],
            vec![0xe000],
            vec![0xfffd],
        ];
        let mut distinct = HashSet::new();
        let mut sorted = BTreeSet::new();
        for units in ordered_units.iter().rev() {
            let text = JsString::from_utf16(units.clone());
            let pointer = text.code_units().as_ptr();
            let original = StableId::new(text).expect("every nonempty code-unit sequence is an ID");
            let cloned = original.clone();
            assert_eq!(cloned, original);
            assert_eq!(cloned.as_js_string().code_units(), units);
            assert_eq!(cloned.as_js_string().code_units().as_ptr(), pointer);
            assert!(distinct.insert(original.clone()));
            assert!(
                !distinct.insert(cloned.clone()),
                "clones must retain Eq/Hash identity"
            );
            assert!(
                distinct.contains(&StableId::new(JsString::from_utf16(units.clone())).unwrap())
            );
            sorted.insert(cloned.clone());
            drop(original);
            assert_eq!(cloned.as_js_string().code_units().as_ptr(), pointer);
        }
        assert_eq!(distinct.len(), ordered_units.len());
        assert_eq!(
            sorted
                .iter()
                .map(|id| id.as_js_string().code_units().to_vec())
                .collect::<Vec<_>>(),
            ordered_units
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
