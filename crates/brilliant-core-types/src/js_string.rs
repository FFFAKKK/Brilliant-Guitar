use std::{borrow::Borrow, string::FromUtf16Error, sync::Arc};

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Immutable JavaScript text. Every UTF-16 code unit, including an unpaired
/// surrogate, is data. There is deliberately no lossy `Display` or `as_str`.
/// This primitive is not yet the storage representation of live Score DTOs.
#[derive(Clone, Debug, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct JsString(Arc<[u16]>);

impl Borrow<[u16]> for JsString {
    fn borrow(&self) -> &[u16] {
        self.code_units()
    }
}

impl JsString {
    pub fn from_utf16(units: Vec<u16>) -> Self {
        Self(units.into())
    }

    pub fn code_units(&self) -> &[u16] {
        &self.0
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Literal/protocol checks do not require allocating or pretending that
    /// arbitrary JavaScript text is a Rust UTF-8 string.
    pub fn eq_ascii(&self, literal: &str) -> bool {
        literal.is_ascii() && self.0.iter().copied().eq(literal.bytes().map(u16::from))
    }

    pub fn to_utf8(&self) -> Result<String, FromUtf16Error> {
        String::from_utf16(&self.0)
    }
}

impl From<&str> for JsString {
    fn from(value: &str) -> Self {
        Self::from_utf16(value.encode_utf16().collect())
    }
}

impl From<String> for JsString {
    fn from(value: String) -> Self {
        Self::from(value.as_str())
    }
}

// Ordinary Serde has only a UTF-8 string event. Unsupported code units must
// fail explicitly; the dedicated lossless codec handles the full string domain.
impl Serialize for JsString {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let text = self.to_utf8().map_err(|_| {
            serde::ser::Error::custom("unpaired UTF-16 requires the lossless codec")
        })?;
        serializer.serialize_str(&text)
    }
}

impl<'de> Deserialize<'de> for JsString {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        String::deserialize(deserializer).map(Self::from)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeSet, HashSet};

    use super::*;

    #[test]
    fn arbitrary_code_units_remain_distinct_without_lossy_utf8() {
        let high = JsString::from_utf16(vec![0xd800]);
        let low = JsString::from_utf16(vec![0xdc00]);
        let replacement = JsString::from("\u{fffd}");
        let pair = JsString::from_utf16(vec![0xd83d, 0xde00]);
        assert_eq!(high.code_units(), [0xd800]);
        assert_eq!(low.code_units(), [0xdc00]);
        assert!(high.to_utf8().is_err());
        assert!(low.to_utf8().is_err());
        assert_eq!(pair.to_utf8().unwrap(), "😀");
        assert_eq!(pair, JsString::from("😀"));
        assert_eq!(pair.len(), 2);
        assert_eq!(HashSet::from([high, low, replacement, pair]).len(), 4);
    }

    #[test]
    fn value_traits_use_utf16_order_and_keep_real_marker_candidates() {
        let values = [
            JsString::from("\u{e000}"),
            JsString::from("\u{10000}"),
            JsString::from_utf16(vec![0xd800]),
            JsString::from("\u{fffd}"),
            JsString::from_utf16(vec![0xdc00]),
        ];
        let order: Vec<_> = BTreeSet::from(values.clone()).into_iter().collect();
        assert_eq!(
            order,
            [
                values[2].clone(),
                values[1].clone(),
                values[4].clone(),
                values[0].clone(),
                values[3].clone()
            ]
        );
        assert_ne!(values[0], values[2]);
        assert_eq!(JsString::from("a"), JsString::from_utf16(vec![97]));
        assert_eq!(
            HashSet::from([JsString::from("a"), JsString::from_utf16(vec![97])]).len(),
            1
        );
    }

    #[test]
    fn clones_share_storage_and_survive_the_source_across_threads() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<JsString>();
        let original = JsString::from_utf16([0x61, 0xd800, 0xdc00, 0xdc00].repeat(16384));
        let copies = vec![original.clone(); 256];
        let pointer = original.code_units().as_ptr();
        drop(original);
        assert!(
            copies
                .iter()
                .all(|value| value.code_units().as_ptr() == pointer)
        );
        assert_eq!(copies[0].len(), 65536);
        let copy = copies[0].clone();
        assert_eq!(
            std::thread::spawn(move || copy.code_units()[3])
                .join()
                .unwrap(),
            0xdc00
        );
    }

    #[test]
    fn ascii_checks_do_not_normalize_or_allocate_text() {
        assert!(JsString::default().is_empty());
        assert!(JsString::default().eq_ascii(""));
        assert!(JsString::from("score").eq_ascii("score"));
        assert!(!JsString::from("score").eq_ascii("Score"));
        assert!(!JsString::from("é").eq_ascii("é"));
        assert!(!JsString::from_utf16(vec![0xd800]).eq_ascii(""));
        assert!(JsString::from("\0\n").eq_ascii("\0\n"));
    }
}
