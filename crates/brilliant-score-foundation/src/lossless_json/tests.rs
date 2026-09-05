use super::*;

fn oracle() -> serde_json::Value {
    serde_json::from_str(include_str!(
        "../../../../test/core-kernel/rust-migration/fixtures/lossless-json-oracle-v1.json"
    ))
    .unwrap()
}

fn encode(value: &LosslessJsonValue) -> Vec<u8> {
    let mut bytes = Vec::new();
    write_lossless_json(value, &mut bytes).unwrap();
    bytes
}

#[test]
fn nested_data_and_keys_match_independent_javascript_canonical_bytes() {
    let oracle = oracle();
    for sample in oracle["samples"]
        .as_array()
        .unwrap()
        .iter()
        .chain(oracle["alternateInputs"].as_array().unwrap())
    {
        let value = decode_lossless_json(sample["input"].as_str().unwrap()).unwrap();
        assert_eq!(
            encode(&value),
            sample["canonical"].as_str().unwrap().as_bytes(),
            "{sample}"
        );
        assert_eq!(
            decode_lossless_json(sample["canonical"].as_str().unwrap()).unwrap(),
            value
        );
        value.validate_limits().unwrap();
    }
}

#[test]
fn syntax_tokens_borrow_raw_strings_and_are_terminal_after_success_or_failure() {
    let source = r#" {"\ud800":["raw 🎸",-0.5,true,null,{}]} "#;
    let mut tokens = LosslessJsonTokens::new(source);
    let values: Vec<_> = tokens.by_ref().collect::<Result<_, _>>().unwrap();
    assert!(tokens.next().is_none());
    assert!(tokens.next().is_none());
    assert_eq!(
        values.iter().map(|value| value.depth).collect::<Vec<_>>(),
        [1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1]
    );
    for token in values {
        if let JsonTokenKind::String(raw) | JsonTokenKind::Key(raw) = token.kind {
            assert_eq!(raw.as_ptr(), source[token.byte_offset..].as_ptr());
            assert!(raw.starts_with('"') && raw.ends_with('"'));
        }
    }
    for input in oracle()["invalidSyntax"].as_array().unwrap() {
        let input = input.as_str().unwrap();
        let mut tokens = LosslessJsonTokens::new(input);
        let error = tokens.by_ref().collect::<Result<Vec<_>, _>>().unwrap_err();
        assert!(error.byte_offset <= input.len());
        assert!(tokens.next().is_none());
        assert!(matches!(
            decode_lossless_json(input),
            Err(LosslessJsonError::Syntax(_))
        ));
    }
}

#[test]
fn mutated_scalar_unicode_json_matches_the_existing_syntax_engine() {
    let alphabet = b"[]{}:,\"\\012.eE+-nutfals \t\nx";
    let mut compared = 0;
    for source in [
        r#"{"a":[0,true,false,null,{},[]]}"#,
        r#"["x\u0061",{"z":-1.25e+2}]"#,
        " 123.5e-10 ",
    ] {
        let original = source.as_bytes();
        for position in 0..=original.len() {
            for byte in alphabet {
                for replace in [false, true] {
                    let mut input = original.to_vec();
                    if replace && position < input.len() {
                        input[position] = *byte;
                    } else {
                        input.insert(position, *byte);
                    }
                    let input = std::str::from_utf8(&input).unwrap();
                    let legacy = serde_json::from_str::<serde_json::Value>(input).is_ok();
                    let actual = LosslessJsonTokens::new(input).all(|token| token.is_ok());
                    assert_eq!(actual, legacy, "syntax mismatch: {input:?}");
                    compared += 1;
                }
            }
        }
    }
    assert!(compared > 3000);
}

#[test]
fn duplicate_keys_compare_decoded_units_without_aliasing_replacement_or_markers() {
    for input in oracle()["duplicates"].as_array().unwrap() {
        assert!(matches!(
            decode_lossless_json(input.as_str().unwrap()),
            Err(LosslessJsonError::DuplicateKey { .. })
        ));
    }
    let input = r#"{"\ud800":1,"\udc00":2,"\ufffd":3,"\ue000":4,"\\ud800":5}"#;
    let LosslessJsonValue::Object(values) = decode_lossless_json(input).unwrap() else {
        panic!("object")
    };
    assert_eq!(values.len(), 5);
    assert!(values.contains_key(&JsString::from_utf16(vec![0xd800])));
    assert!(values.contains_key(&JsString::from("\\ud800")));
    assert!(decode_lossless_json(r#"{"x":{},"y":{"x":0}}"#).is_ok());
}

#[test]
fn depth_limits_and_legacy_syntax_nesting_remain_distinct() {
    for depth in [1, 63, 64, 65, 127, 128, 129] {
        let input = format!("{}0{}", "[".repeat(depth - 1), "]".repeat(depth - 1));
        let legacy = serde_json::from_str::<serde_json::Value>(&input);
        let tokens = LosslessJsonTokens::new(&input).collect::<Result<Vec<_>, _>>();
        assert_eq!(tokens.is_ok(), legacy.is_ok(), "depth {depth}");
        let result = decode_lossless_json(&input);
        if depth <= JSON_DEPTH_LIMIT {
            assert!(result.is_ok());
        } else if legacy.is_ok() {
            assert!(matches!(
                result,
                Err(LosslessJsonError::Limit(CoreTypeFailure::JsonDepthLimit {
                    actual: 65
                }))
            ));
        } else {
            assert!(matches!(result, Err(LosslessJsonError::Syntax(_))));
        }
    }
}

#[test]
fn bounded_capture_scans_the_tail_and_preserves_fault_precedence() {
    assert!(decode_with_limits(r#"{"a":[0,1],"b":true}"#, 3, 5).is_ok());
    assert!(matches!(
        decode_with_limits(r#"{"a":[0,1],"b":true}"#, 3, 4),
        Err(LosslessJsonError::Limit(
            CoreTypeFailure::JsonPropertyLimit { actual: 5 }
        ))
    ));
    assert!(matches!(
        decode_with_limits(r#"{"a":0,"a":[[1]]}"#, 2, 2),
        Err(LosslessJsonError::Limit(CoreTypeFailure::JsonDepthLimit {
            actual: 3
        }))
    ));
    assert!(matches!(
        decode_with_limits(r#"{"a":0,"a":[1,2]}"#, 64, 2),
        Err(LosslessJsonError::Limit(
            CoreTypeFailure::JsonPropertyLimit { actual: 3 }
        ))
    ));
    for prefix in ["[0,1,", "{\"a\":0,\"a\":", "[[["] {
        let input = format!("{prefix}\"\\ud800\\uXYZW\"");
        assert!(matches!(
            decode_with_limits(&input, 2, 2),
            Err(LosslessJsonError::Syntax(_))
        ));
    }
    let long_tail = format!("[0,1,\"{}\\ud800\"]", "x".repeat(1024 * 1024));
    assert!(matches!(
        decode_with_limits(&long_tail, 64, 2),
        Err(LosslessJsonError::Limit(
            CoreTypeFailure::JsonPropertyLimit { actual: 3 }
        ))
    ));
}

#[test]
fn actual_property_ceiling_is_inclusive_and_keys_do_not_count_as_values() {
    let input = format!("[{}0]", "0,".repeat(JSON_PROPERTY_LIMIT - 2));
    let value = decode_lossless_json(&input).unwrap();
    assert!(
        matches!(&value, LosslessJsonValue::Array(values) if values.len() == JSON_PROPERTY_LIMIT - 1)
    );
    value.validate_limits().unwrap();
    drop(value);
    let overflow = format!("[{}0]", "0,".repeat(JSON_PROPERTY_LIMIT - 1));
    assert!(
        matches!(decode_lossless_json(&overflow), Err(LosslessJsonError::Limit(CoreTypeFailure::JsonPropertyLimit { actual })) if actual == JSON_PROPERTY_LIMIT + 1)
    );
    assert!(decode_with_limits(r#"{"a":0,"b":0}"#, 2, 3).is_ok());
}

#[test]
fn writer_validates_before_output_and_propagates_all_partial_write_failures() {
    struct FailAfter {
        remaining: usize,
        retained: Vec<u8>,
    }
    impl Write for FailAfter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if self.remaining == 0 {
                return Err(std::io::Error::other("injected"));
            }
            let length = self.remaining.min(bytes.len());
            self.retained.extend_from_slice(&bytes[..length]);
            self.remaining -= length;
            Ok(length)
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let value = decode_lossless_json(r#"{"\ud800":[0.125,"\udc00",false,null,{}]}"#).unwrap();
    let expected = encode(&value);
    for remaining in 0..expected.len() {
        let mut writer = FailAfter {
            remaining,
            retained: Vec::new(),
        };
        assert!(write_lossless_json(&value, &mut writer).is_err());
        assert_eq!(writer.retained, expected[..remaining]);
    }
    let mut too_deep = LosslessJsonValue::Null;
    for _ in 0..JSON_DEPTH_LIMIT {
        too_deep = LosslessJsonValue::Array(vec![too_deep]);
    }
    let mut bytes = Vec::new();
    assert!(matches!(
        write_lossless_json(&too_deep, &mut bytes),
        Err(LosslessJsonError::Limit(
            CoreTypeFailure::JsonDepthLimit { .. }
        ))
    ));
    assert!(bytes.is_empty());
}
