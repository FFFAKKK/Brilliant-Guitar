use super::*;

fn oracle() -> serde_json::Value {
    serde_json::from_str(include_str!(
        "../../../../test/core-kernel/rust-migration/fixtures/js-string-oracle-v1.json"
    ))
    .unwrap()
}

fn units(sample: &serde_json::Value) -> Vec<u16> {
    sample["units"]
        .as_array()
        .unwrap()
        .iter()
        .map(|unit| u16::try_from(unit.as_u64().unwrap()).unwrap())
        .collect()
}

#[test]
fn all_reference_strings_decode_write_and_count_exact_javascript_bytes() {
    for sample in oracle()["samples"].as_array().unwrap() {
        let expected = JsString::from_utf16(units(sample));
        for field in ["token", "escapedToken"] {
            assert_eq!(
                decode_js_string_token(sample[field].as_str().unwrap()).unwrap(),
                expected,
                "{} {field}",
                sample["label"]
            );
        }
        let mut bytes = Vec::new();
        write_js_string_json(&expected, &mut bytes).unwrap();
        assert_eq!(
            bytes,
            sample["token"].as_str().unwrap().as_bytes(),
            "{}",
            sample["label"]
        );
        assert_eq!(js_string_json_len(&expected), Some(bytes.len()));
    }
}

#[test]
fn strings_sort_by_javascript_code_units_including_surrogates_and_astral_text() {
    let oracle = oracle();
    let mut strings: Vec<_> = oracle["samples"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
        .map(|(index, sample)| (index, JsString::from_utf16(units(sample))))
        .collect();
    strings.sort_by(|left, right| left.1.cmp(&right.1));
    let expected: Vec<_> = oracle["sortedIndices"]
        .as_array()
        .unwrap()
        .iter()
        .map(|index| index.as_u64().unwrap() as usize)
        .collect();
    assert_eq!(
        strings.iter().map(|(index, _)| *index).collect::<Vec<_>>(),
        expected
    );
}

#[test]
fn malformed_tokens_reject_with_bounded_byte_offsets() {
    for token in oracle()["invalidTokens"].as_array().unwrap() {
        let token = token.as_str().unwrap();
        let error = decode_js_string_token(token).unwrap_err();
        assert!(error.byte_offset <= token.len(), "{token:?}");
    }
    for (token, offset) in [
        (" \"a\"", 0),
        ("\"a\" ", 3),
        ("\"é\"x", 4),
        ("\"\\u12z4\"", 5),
        ("\"\\", 2),
    ] {
        assert_eq!(
            decode_js_string_token(token),
            Err(JsStringTokenError {
                byte_offset: offset
            })
        );
    }
}

#[test]
fn every_single_utf16_unit_has_an_exact_token_roundtrip() {
    for unit in 0..=u16::MAX {
        let value = JsString::from_utf16(vec![unit]);
        let mut bytes = Vec::new();
        write_js_string_json(&value, &mut bytes).unwrap();
        let token = std::str::from_utf8(&bytes).unwrap();
        assert_eq!(
            decode_js_string_token(token).unwrap(),
            value,
            "unit {unit:x}"
        );
        assert_eq!(js_string_json_len(&value), Some(bytes.len()));
        if !(0xd800..=0xdfff).contains(&unit) {
            let standard: String = serde_json::from_slice(&bytes).unwrap();
            assert_eq!(standard.encode_utf16().collect::<Vec<_>>(), [unit]);
        }
    }
}

#[test]
fn quoted_keys_keep_distinct_code_units_and_normalize_only_json_escapes() {
    use std::collections::BTreeMap;
    let mut map = BTreeMap::new();
    for token in [
        r#""\ud800""#,
        r#""\udc00""#,
        r#""\ufffd""#,
        r#""\ue000""#,
        r#""\\ud800""#,
    ] {
        assert!(
            map.insert(decode_js_string_token(token).unwrap(), token)
                .is_none()
        );
    }
    let first = decode_js_string_token(r#""a""#).unwrap();
    let escaped = decode_js_string_token(r#""\u0061""#).unwrap();
    assert_eq!(first, escaped);
    assert!(map.insert(first, "first").is_none());
    assert_eq!(map.insert(escaped, "second"), Some("first"));
}

#[test]
fn writer_failure_propagates_at_every_output_byte() {
    struct FailAfter {
        remaining: usize,
        retained: Vec<u8>,
    }
    impl Write for FailAfter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            if self.remaining == 0 {
                return Err(io::Error::other("injected writer failure"));
            }
            let length = bytes.len().min(self.remaining);
            self.retained.extend_from_slice(&bytes[..length]);
            self.remaining -= length;
            Ok(length)
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    let value = JsString::from_utf16(vec![0x22, 0x5c, 0, 0xd800, 0x61, 0xd83d, 0xde00, 0xdc00]);
    let mut expected = Vec::new();
    write_js_string_json(&value, &mut expected).unwrap();
    for remaining in 0..expected.len() {
        let mut writer = FailAfter {
            remaining,
            retained: Vec::new(),
        };
        assert_eq!(
            write_js_string_json(&value, &mut writer)
                .unwrap_err()
                .kind(),
            io::ErrorKind::Other
        );
        assert_eq!(writer.retained, expected[..remaining]);
    }
}
#[test]
fn ascii_token_recognition_uses_only_the_supplied_capacity_and_validates_the_tail() {
    use crate::decode_js_string_ascii_token;
    for token in [
        r#""apiVersion""#,
        r#""\u0061piVersion""#,
        r#""""#,
        r#""\ud800""#,
        r#""🎸""#,
        r#""\n""#,
        r#""0123456789abcdefghijkl""#,
    ] {
        let mut buffer = [0; 16];
        let expected = crate::decode_js_string_token(token)
            .unwrap()
            .to_utf8()
            .ok()
            .filter(|text| text.is_ascii() && text.len() <= buffer.len());
        assert_eq!(
            decode_js_string_ascii_token(token, &mut buffer).unwrap(),
            expected.as_deref()
        );
    }
    let mut empty = [];
    assert_eq!(
        decode_js_string_ascii_token(r#""""#, &mut empty).unwrap(),
        Some("")
    );
    assert_eq!(
        decode_js_string_ascii_token(r#""a""#, &mut empty).unwrap(),
        None
    );
    let long = format!("\"{}\\uD800\"", "x".repeat(100_000));
    assert_eq!(
        decode_js_string_ascii_token(&long, &mut empty).unwrap(),
        None
    );
    for invalid in [r#""a" []"#, r#""\u00""#, r#""\ud800" trailing"#] {
        assert!(decode_js_string_ascii_token(invalid, &mut empty).is_err());
    }
}
