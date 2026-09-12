//! Actual scoped guest counterpart of the CVN6 fixture's normal callbacks.
//! Special markers exercise malicious output and resource failure. This guest
//! has no host imports; unsafe pointers address only its own Wasm linear memory.
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
    let request: Value = serde_json::from_slice(input).expect("guest JSON input");
    let result = execute(&request);
    let mut output = if request["arguments"][0]["payload"]["marker"] == "invalid-utf8" {
        b"{\"status\":\"decoded\",\"command\":\"\xff\"}".to_vec()
    } else {
        serde_json::to_vec(&result).unwrap()
    };
    let packed = ((output.as_mut_ptr() as u64) << 32) | output.len() as u64;
    std::mem::forget(output);
    packed
}

fn execute(request: &Value) -> Value {
    let args = &request["arguments"];
    let source = request["moduleId"].as_str().unwrap();
    let contribution = request["contributionId"].as_str().unwrap();
    let is_score = source == "fixture.score.module";
    let namespace = if is_score {
        "fixture.score"
    } else {
        "fixture.part"
    };
    let owner = if is_score {
        json!({"kind":"score"})
    } else {
        json!({"kind":"part","partId":"part-1"})
    };
    match request["operation"].as_str().unwrap() {
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
                return json!({"status":"invalid"});
            }
            json!({"status":"decoded","command":{"noteId":payload["noteId"],"pitch":payload["pitch"],
                "schemaVersion":payload["schemaVersion"],"marker":payload["marker"]}})
        }
        "commandPrepare" => {
            let payload = &args[1];
            let effect_namespace = if payload["marker"] == "foreign-write" {
                "fixture.part"
            } else {
                namespace
            };
            let address = if is_score {
                json!({"kind":"document","documentId":args[0]["documentId"]})
            } else {
                json!({"kind":"part","partId":"part-1"})
            };
            json!({"status":"changed","effectRequests":[
                {"requestVersion":1,"requestKind":"core.note.replace-written-pitch","target":{"kind":"note","noteId":payload["noteId"]},"writtenPitch":payload["pitch"]},
                {"requestVersion":1,"requestKind":"module.extension","effectKind":format!("{effect_namespace}.replace"),
                    "namespace":effect_namespace,"owner":owner,"payload":{"schemaVersion":payload["schemaVersion"],"marker":payload["marker"]}}],
                "affected":[{"kind":"note","noteId":payload["noteId"]},address]})
        }
        "effectDecode" => {
            let payload = &args[0];
            if !payload["schemaVersion"].is_number() || !payload["marker"].is_string() {
                return json!({"status":"invalid"});
            }
            json!({"status":"decoded","payload":{"schemaVersion":payload["schemaVersion"],"marker":payload["marker"]}})
        }
        "effectTransform" => {
            let payload = &args[0]["payload"];
            // Assert the host view excludes every other contribution's data.
            assert!(args[0]["view"]["compatibleExtensions"]
                .as_array()
                .unwrap()
                .iter()
                .all(|block| block["namespace"] == namespace));
            json!({"status":"replace","schemaVersion":payload["schemaVersion"],"payload":{"marker":payload["marker"]}})
        }
        "validate" => {
            let blocks = args[0]["compatibleExtensions"].as_array().unwrap();
            assert!(blocks.iter().all(|block| block["namespace"] == namespace));
            if blocks
                .iter()
                .any(|block| block["payload"]["marker"] == "aggregate")
            {
                return json!({"ok":true,"assessment":{"modules":[]}});
            }
            if blocks
                .iter()
                .any(|block| block["payload"]["marker"] == "forged-issue")
            {
                return json!([{"issueVersion":1,"code":"fixture.part.module.semantic-invalid", "severity":"error",
                    "messageKey":"module.fixture.part.module.semantic-invalid",
                    "source":{"kind":"module","moduleId":"fixture.part.module","contributionId":"fixture.part.contribution.v1"}}]);
            }
            if blocks
                .iter()
                .any(|block| block["payload"]["marker"] == "reject")
            {
                return json!([{"issueVersion":1,"code":format!("{source}.semantic-invalid"),"severity":"error",
                    "messageKey":format!("module.{source}.semantic-invalid"),
                    "source":{"kind":"module","moduleId":source,"contributionId":contribution}}]);
            }
            json!([])
        }
        "classify" => json!({"status":"supported","issues":[]}),
        _ => panic!("unknown callback operation"),
    }
}
