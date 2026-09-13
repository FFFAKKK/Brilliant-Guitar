//! Reference data-only selective-read guest. Each restart is a fresh bounded
//! instance; completed reads arrive as data, never as host imports or pointers.
use brilliant_extension_protocol::scoped_guest::decode_guest_json;
use serde_json::{json, Value};

#[no_mangle]
pub extern "C" fn brilliant_alloc_v1(length: u32) -> u32 {
    let mut bytes = vec![0u8; length as usize];
    let pointer = bytes.as_mut_ptr() as u32;
    std::mem::forget(bytes);
    pointer
}

#[no_mangle]
pub unsafe extern "C" fn brilliant_execute_v1(pointer: u32, length: u32) -> u64 {
    let input = std::slice::from_raw_parts(pointer as *const u8, length as usize);
    let request = decode_guest_json(input).expect("guest V2 JSON");
    assert_eq!(request["callbackVersion"], 2);
    let result = if request["operation"] == "capabilities" {
        json!({"callbackVersion":2,"coreReadVersion":2})
    } else {
        match execute(&request) {
            Ok(value) => json!({"callbackVersion":2,"status":"complete","value":value}),
            Err(query) => json!({"callbackVersion":2,"status":"read","query":query}),
        }
    };
    let mut output = if request["operation"] == "commandDecode"
        && request["arguments"][0]["payload"]["marker"] == "invalid-utf8"
    {
        b"{\"invalid\":\"\xff\"}".to_vec()
    } else {
        serde_json::to_vec(&result).unwrap()
    };
    let packed = ((output.as_mut_ptr() as u64) << 32) | output.len() as u64;
    std::mem::forget(output);
    packed
}

fn note_query(id: &Value) -> Value {
    json!({"readVersion":2,"selectorId":"core.selector.score-entity","address":{"kind":"note","noteId":id}})
}
fn read<'a>(request: &'a Value, query: Value) -> Result<&'a Value, Value> {
    request["coreReads"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["query"] == query)
        .map(|row| &row["reply"]["result"])
        .ok_or(query)
}
fn issue(request: &Value) -> Value {
    let source = request["moduleId"].as_str().unwrap();
    json!({"issueVersion":1,"code":format!("{source}.semantic-invalid"),"severity":"error",
      "messageKey":format!("module.{source}.semantic-invalid"),
      "source":{"kind":"module","moduleId":source,"contributionId":request["contributionId"]}})
}
fn execute(request: &Value) -> Result<Value, Value> {
    let source = request["moduleId"].as_str().unwrap();
    let is_score = source == "fixture.score.module";
    let namespace = if is_score {
        "fixture.score"
    } else {
        "fixture.part"
    };
    let args = &request["arguments"];
    let operation = request["operation"].as_str().unwrap();
    let view = if operation == "effectTransform" {
        &args[0]["view"]
    } else {
        &args[0]
    };
    if matches!(
        operation,
        "commandPrepare" | "effectTransform" | "validate" | "classify"
    ) {
        assert_eq!(view["viewVersion"], 2);
        assert!(view.get("coreDocument").is_none());
        assert!(view["compatibleExtensions"]
            .as_array()
            .unwrap()
            .iter()
            .all(|block| block["namespace"] == namespace));
    }
    Ok(match operation {
        "commandDecode" => {
            let payload = &args[0]["payload"];
            if payload["marker"] == "fuel" {
                loop {
                    std::hint::spin_loop();
                }
            }
            if !payload["noteId"].is_string()
                || !payload["pitch"].is_object()
                || !payload["schemaVersion"].is_number()
                || !payload["marker"].is_string()
            {
                return Ok(json!({"status":"invalid"}));
            }
            json!({"status":"decoded","command":payload})
        }
        "commandPrepare" => {
            let payload = &args[1];
            if payload["marker"] == "bad-read" {
                return Err(json!({"readVersion":2,"selectorId":"extensions"}));
            }
            if payload["marker"] == "read-forever" {
                return Err(note_query(&json!(format!(
                    "missing-{}",
                    request["coreReads"].as_array().unwrap().len()
                ))));
            }
            if payload["marker"] == "repeat-read" {
                return Err(note_query(&payload["noteId"]));
            }
            let selected = read(request, note_query(&payload["noteId"]))?;
            let marker = if payload["marker"] == "read-note" {
                assert_eq!(selected["ok"], true);
                json!(format!(
                    "observed:{}:{}",
                    selected["value"]["value"]["id"].as_str().unwrap(),
                    selected["value"]["value"]["writtenPitch"]["step"]
                        .as_str()
                        .unwrap()
                ))
            } else if payload["marker"] == "verify-current" {
                json!(format!(
                    "verify:{}:{}",
                    payload["noteId"].as_str().unwrap(),
                    payload["pitch"]["step"].as_str().unwrap()
                ))
            } else if payload["marker"] == "read-dependency" {
                let dependency = &view["dependencyReads"][0];
                assert_eq!(dependency["namespace"], "fixture.part");
                assert_eq!(dependency["provider"]["moduleId"], "fixture.part.module");
                dependency["blocks"].as_array().unwrap().first().unwrap()["payload"]["marker"]
                    .clone()
            } else {
                payload["marker"].clone()
            };
            let effect_namespace = if payload["marker"] == "foreign-write" {
                "fixture.part"
            } else {
                namespace
            };
            let owner = if is_score {
                json!({"kind":"score"})
            } else {
                json!({"kind":"part","partId":"part-1"})
            };
            let address = if is_score {
                json!({"kind":"document","documentId":view["documentId"]})
            } else {
                json!({"kind":"part","partId":"part-1"})
            };
            json!({"status":"changed","effectRequests":[
                {"requestVersion":1,"requestKind":"core.note.replace-written-pitch","target":{"kind":"note","noteId":payload["noteId"]},"writtenPitch":payload["pitch"]},
                {"requestVersion":1,"requestKind":"module.extension","effectKind":format!("{effect_namespace}.replace"),
                 "namespace":effect_namespace,"owner":owner,"payload":{"schemaVersion":payload["schemaVersion"],"marker":marker}}],
                "affected":[{"kind":"note","noteId":payload["noteId"]},address]})
        }
        "effectDecode" => {
            let payload = &args[0];
            if !payload["schemaVersion"].is_number() || !payload["marker"].is_string() {
                return Ok(json!({"status":"invalid"}));
            }
            json!({"status":"decoded","payload":payload})
        }
        "effectTransform" => {
            let payload = &args[0]["payload"];
            json!({"status":"replace","schemaVersion":payload["schemaVersion"],"payload":{"marker":payload["marker"]}})
        }
        "validate" => {
            for block in view["compatibleExtensions"].as_array().unwrap() {
                let marker = block["payload"]["marker"].as_str().unwrap_or("");
                if marker == "aggregate" {
                    return Ok(json!({"ok":true,"assessment":{"modules":[]}}));
                }
                if marker == "forged-issue" {
                    return Ok(
                        json!([{"issueVersion":1,"code":"fixture.part.module.semantic-invalid","severity":"error",
                        "messageKey":"module.fixture.part.module.semantic-invalid",
                        "source":{"kind":"module","moduleId":"fixture.part.module","contributionId":"fixture.part.contribution.v1"}}]),
                    );
                }
                if marker == "reject" {
                    return Ok(json!([issue(request)]));
                }
                if let Some(expected) = marker.strip_prefix("verify:") {
                    let (id, pitch) = expected.rsplit_once(':').unwrap();
                    let result = read(request, note_query(&json!(id)))?;
                    if result["ok"] != true
                        || result["value"]["value"]["writtenPitch"]["step"] != pitch
                    {
                        return Ok(json!([issue(request)]));
                    }
                }
            }
            json!([])
        }
        "classify" => json!({"status":"supported","issues":[]}),
        _ => panic!("unsupported callback operation"),
    })
}
