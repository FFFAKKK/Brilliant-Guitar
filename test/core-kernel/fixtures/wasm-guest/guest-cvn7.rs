//! CVN-7 synthetic module behavior over the bounded guest V2 ABI.
//! Preserve JS strings/numbers, including lone UTF-16 surrogates and -0.
use brilliant_core_types::{FiniteNumber, JsonValue as J, LosslessJsonValue as Value};
use brilliant_score_foundation::{decode_js_value_json, with_json_field_key, LosslessEncode};

fn object<const N: usize>(fields: [(&str, Value); N]) -> Value {
    J::Object(
        fields
            .into_iter()
            .map(|(key, value)| (key.into(), value))
            .collect(),
    )
}
fn text(value: &str) -> Value {
    J::String(value.into())
}
fn number(value: u64) -> Value {
    J::Number(FiniteNumber::new(value as f64).unwrap())
}
fn get<'a>(value: &'a Value, key: &str) -> &'a Value {
    match value {
        J::Object(fields) => with_json_field_key(key, |key| fields.get(key)).unwrap_or(&J::Null),
        _ => &J::Null,
    }
}
fn tag(value: &Value, expected: &str) -> bool {
    matches!(value, J::String(value) if value.eq_ascii(expected))
}
fn exact(value: &Value, keys: &[&str]) -> bool {
    matches!(value, J::Object(fields) if fields.len() == keys.len() &&
        keys.iter().all(|key| with_json_field_key(key, |key| fields.contains_key(key))))
}
fn nonempty(value: &Value) -> bool {
    matches!(value, J::String(value) if !value.is_empty())
}
fn is_string(value: &Value) -> bool {
    matches!(value, J::String(_))
}
fn integer_in(value: &Value, min: f64, max: f64) -> bool {
    matches!(value, J::Number(value) if value.get().fract() == 0.0 && value.get() >= min && value.get() <= max)
}
fn pitch(value: &Value) -> bool {
    exact(value, &["step", "alter", "octave"])
        && ["C", "D", "E", "F", "G", "A", "B"]
            .iter()
            .any(|step| tag(get(value, "step"), step))
        && integer_in(get(value, "alter"), -2.0, 2.0)
        && integer_in(get(value, "octave"), 0.0, 8.0)
}

#[no_mangle]
pub extern "C" fn brilliant_alloc_v1(length: u32) -> u32 {
    let mut bytes = vec![0u8; length as usize];
    let pointer = bytes.as_mut_ptr() as u32;
    std::mem::forget(bytes);
    pointer
}
#[no_mangle]
/// # Safety
/// The Wasm host must provide an initialized region returned by
/// `brilliant_alloc_v1`, with at least `length` bytes in this guest's memory.
pub unsafe extern "C" fn brilliant_execute_v1(pointer: u32, length: u32) -> u64 {
    let input = std::slice::from_raw_parts(pointer as *const u8, length as usize);
    let request = decode_js_value_json(std::str::from_utf8(input).unwrap()).unwrap();
    assert!(integer_in(get(&request, "callbackVersion"), 2.0, 2.0));
    let result = if tag(get(&request, "operation"), "capabilities") {
        object([
            ("callbackVersion", number(2)),
            ("coreReadVersion", number(2)),
        ])
    } else {
        object([
            ("callbackVersion", number(2)),
            ("status", text("complete")),
            ("value", execute(&request)),
        ])
    };
    let mut output = Vec::new();
    result.write_lossless(&mut output).unwrap();
    let packed = ((output.as_mut_ptr() as u64) << 32) | output.len() as u64;
    std::mem::forget(output);
    packed
}

fn execute(request: &Value) -> Value {
    let module = if tag(get(request, "moduleId"), "fixture.cvn7.score.module") {
        "score"
    } else {
        assert!(tag(get(request, "moduleId"), "fixture.cvn7.part.module"));
        "part"
    };
    assert!(tag(
        get(request, "contributionId"),
        &format!("fixture.cvn7.{module}.contribution.v1")
    ));
    let namespace = format!("fixture.cvn7.{module}");
    let J::String(operation) = get(request, "operation") else {
        panic!("operation")
    };
    let operation = operation.to_utf8().unwrap();
    let J::Array(args) = get(request, "arguments") else {
        panic!("arguments")
    };
    if matches!(operation.as_str(), "commandDecode" | "commandPrepare") {
        assert!(tag(
            get(request, "definitionId"),
            &format!("{namespace}.apply")
        ));
    } else if matches!(operation.as_str(), "effectDecode" | "effectTransform") {
        assert!(tag(
            get(request, "definitionId"),
            &format!("{namespace}.replace")
        ));
    } else {
        assert_eq!(get(request, "definitionId"), &J::Null);
    }
    if matches!(
        operation.as_str(),
        "commandPrepare" | "effectTransform" | "validate" | "classify"
    ) {
        let view = if operation == "effectTransform" {
            get(&args[0], "view")
        } else {
            &args[0]
        };
        assert!(integer_in(get(view, "viewVersion"), 2.0, 2.0));
        assert_eq!(get(view, "coreDocument"), &J::Null);
        let J::Array(blocks) = get(view, "compatibleExtensions") else {
            panic!("extensions")
        };
        assert!(blocks
            .iter()
            .all(|block| tag(get(block, "namespace"), &namespace)));
    }
    match operation.as_str() {
        "commandDecode" => {
            let payload = get(&args[0], "payload");
            let target = get(&args[0], "target");
            let (kind, key) = if module == "score" {
                ("document", "documentId")
            } else {
                ("part", "partId")
            };
            if !exact(payload, &["noteId", "pitch", "marker"])
                || !nonempty(get(payload, "noteId"))
                || !pitch(get(payload, "pitch"))
                || !is_string(get(payload, "marker"))
                || !exact(target, &["kind", key])
                || !tag(get(target, "kind"), kind)
                || !nonempty(get(target, key))
            {
                return object([("status", text("invalid"))]);
            }
            let owner = object([("kind", text(module)), (key, get(target, key).clone())]);
            object([
                ("status", text("decoded")),
                (
                    "command",
                    object([
                        ("owner", owner),
                        ("noteId", get(payload, "noteId").clone()),
                        ("pitch", get(payload, "pitch").clone()),
                        ("marker", get(payload, "marker").clone()),
                    ]),
                ),
            ])
        }
        "commandPrepare" => {
            let command = &args[1];
            let owner = if tag(get(get(command, "owner"), "kind"), "score") {
                object([("kind", text("score"))])
            } else {
                object([
                    ("kind", text("part")),
                    ("partId", get(get(command, "owner"), "partId").clone()),
                ])
            };
            let affected_owner = if module == "score" {
                object([
                    ("kind", text("document")),
                    ("documentId", get(&args[0], "documentId").clone()),
                ])
            } else {
                object([
                    ("kind", text("part")),
                    ("partId", get(&owner, "partId").clone()),
                ])
            };
            object([
                ("status", text("changed")),
                (
                    "effectRequests",
                    J::Array(vec![
                        object([
                            ("requestVersion", number(1)),
                            ("requestKind", text("core.note.replace-written-pitch")),
                            (
                                "target",
                                object([
                                    ("kind", text("note")),
                                    ("noteId", get(command, "noteId").clone()),
                                ]),
                            ),
                            ("writtenPitch", get(command, "pitch").clone()),
                        ]),
                        object([
                            ("requestVersion", number(1)),
                            ("requestKind", text("module.extension")),
                            ("effectKind", text(&format!("{namespace}.replace"))),
                            ("namespace", text(&namespace)),
                            ("owner", owner),
                            (
                                "payload",
                                object([
                                    ("marker", get(command, "marker").clone()),
                                    ("generatorVersion", number(1)),
                                    ("schemaVersion", number(1)),
                                ]),
                            ),
                        ]),
                    ]),
                ),
                (
                    "affected",
                    J::Array(vec![
                        object([
                            ("kind", text("note")),
                            ("noteId", get(command, "noteId").clone()),
                        ]),
                        affected_owner,
                    ]),
                ),
            ])
        }
        "effectDecode" => {
            let input = &args[0];
            if !exact(input, &["marker", "generatorVersion", "schemaVersion"])
                || !is_string(get(input, "marker"))
                || !integer_in(get(input, "generatorVersion"), 1.0, 1.0)
                || !integer_in(get(input, "schemaVersion"), 1.0, 2.0)
            {
                return object([("status", text("invalid"))]);
            }
            object([("status", text("decoded")), ("payload", input.clone())])
        }
        "effectTransform" => {
            let payload = get(&args[0], "payload");
            object([
                ("status", text("replace")),
                ("schemaVersion", get(payload, "schemaVersion").clone()),
                (
                    "payload",
                    object([
                        ("marker", get(payload, "marker").clone()),
                        ("generatorVersion", number(1)),
                    ]),
                ),
            ])
        }
        // Frozen synthetic validators intentionally accept all scoped data.
        "validate" => J::Array(vec![]),
        "classify" => object([("status", text("supported")), ("issues", J::Array(vec![]))]),
        _ => panic!("unknown qualification operation"),
    }
}
