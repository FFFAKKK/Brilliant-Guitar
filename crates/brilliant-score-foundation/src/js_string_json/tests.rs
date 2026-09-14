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
fn raw_text_and_json_budgets_match_independent_javascript_encoders() {
    let lengths: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../test/core-kernel/rust-migration/fixtures/js-string-byte-length-oracle-v1.json"
    ))
    .unwrap();
    let oracle = oracle();
    let samples = oracle["samples"].as_array().unwrap();
    let lengths = lengths["samples"].as_array().unwrap();
    assert_eq!(samples.len(), lengths.len());
    for (sample, length) in samples.iter().zip(lengths) {
        assert_eq!(sample["label"], length["label"]);
        let value = JsString::from_utf16(units(sample));
        assert_eq!(
            value.utf8_byte_len() as u64,
            length["utf8Bytes"].as_u64().unwrap(),
            "{}",
            sample["label"]
        );
        assert_eq!(
            js_string_json_len(&value).unwrap() as u64,
            length["jsonBytes"].as_u64().unwrap(),
            "{}",
            sample["label"]
        );
        assert_eq!(
            value.code_units(),
            units(sample),
            "accounting must not normalize text"
        );
    }
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
    use brilliant_core_types::JsonObject;
    let mut map = JsonObject::new();
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

#[test]
fn buffered_writer_preserves_escapes_pairs_and_unpaired_units_across_block_edges() {
    let suffix_units = [
        0x22, 0x5c, 0, 0xd800, 0x7a, 0xd83d, 0xde00, 0xdc00, 10, 0xe9,
    ];
    let suffix_json = r#"\"\\\u0000\ud800z😀\udc00\né"#;
    for prefix_length in 1016..1032 {
        let mut units = vec![u16::from(b'a'); prefix_length];
        units.extend(suffix_units);
        units.extend(vec![u16::from(b'b'); 1100]);
        let value = JsString::from_utf16(units);
        let expected = format!(
            "\"{}{suffix_json}{}\"",
            "a".repeat(prefix_length),
            "b".repeat(1100)
        );
        let mut bytes = Vec::new();
        write_js_string_json(&value, &mut bytes).unwrap();
        assert_eq!(bytes, expected.as_bytes(), "prefix {prefix_length}");
        assert_eq!(js_string_json_len(&value), Some(expected.len()));
        assert_eq!(decode_js_string_token(&expected).unwrap(), value);
    }

    // A short input can expand beyond the short stack buffer through escaping.
    let value = JsString::from_utf16(vec![0; 32]);
    let expected = format!("\"{}\"", r"\u0000".repeat(32));
    let mut bytes = Vec::new();
    write_js_string_json(&value, &mut bytes).unwrap();
    assert_eq!(bytes, expected.as_bytes());
}

#[test]
fn buffered_writer_honors_partial_writes_and_faults_at_every_byte_across_blocks() {
    struct PartialWriter {
        bytes: Vec<u8>,
        fail_after: usize,
    }
    impl Write for PartialWriter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            if self.bytes.len() == self.fail_after {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "blocked output byte",
                ));
            }
            let length = bytes.len().min(7).min(self.fail_after - self.bytes.len());
            self.bytes.extend_from_slice(&bytes[..length]);
            Ok(length)
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    let mut units = vec![u16::from(b'a'); 1022];
    units.extend([0x22, 0x5c, 0, 0xd800, 0x7a, 0xd83d, 0xde00, 0xdc00]);
    units.extend(vec![u16::from(b'b'); 1024]);
    let value = JsString::from_utf16(units);
    let expected = format!(
        "\"{}{}{}\"",
        "a".repeat(1022),
        r#"\"\\\u0000\ud800z😀\udc00"#,
        "b".repeat(1024)
    )
    .into_bytes();
    for fail_after in 0..expected.len() {
        let mut writer = PartialWriter {
            bytes: Vec::new(),
            fail_after,
        };
        let failure = write_js_string_json(&value, &mut writer).unwrap_err();
        assert_eq!(failure.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(failure.to_string(), "blocked output byte");
        assert_eq!(
            writer.bytes,
            expected[..fail_after],
            "failure byte {fail_after}"
        );
    }
    let mut writer = PartialWriter {
        bytes: Vec::new(),
        fail_after: expected.len(),
    };
    write_js_string_json(&value, &mut writer).unwrap();
    assert_eq!(writer.bytes, expected);
}

#[test]
fn buffered_writer_batches_long_ascii_and_emits_short_ids_in_one_write() {
    #[derive(Default)]
    struct CountingWriter {
        calls: usize,
        bytes: usize,
        largest: usize,
    }
    impl Write for CountingWriter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.calls += 1;
            self.bytes += bytes.len();
            self.largest = self.largest.max(bytes.len());
            Ok(bytes.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    let mut short = CountingWriter::default();
    write_js_string_json(&JsString::from("event-102400"), &mut short).unwrap();
    assert_eq!(short.calls, 1);
    assert_eq!(short.bytes, b"\"event-102400\"".len());

    let value = JsString::from("a".repeat(8192));
    let mut long = CountingWriter::default();
    write_js_string_json(&value, &mut long).unwrap();
    assert_eq!(long.bytes, 8194);
    assert_eq!(long.calls, 8194_usize.div_ceil(1024));
    assert_eq!(long.largest, 1024);
}
