//! Actual scoped guest counterpart of the CVN6 fixture's normal callbacks.
//! Special markers exercise malicious output and resource failure. This guest
//! has no host imports; unsafe pointers address only its own Wasm linear memory.
use brilliant_extension_protocol::scoped_guest::{
    ScopedCallbackArgumentsV1 as Args, ScopedCallbackRequestV1,
};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
struct Core<'a> {
    #[serde(borrow)]
    parts: Vec<Part<'a>>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Part<'a> {
    #[serde(borrow)]
    measure_contents: Vec<&'a serde_json::value::RawValue>,
}

// Read actual Core data without expanding every note into Value. The complete
// request still arrives; this plugin chooses a typed Core shape during parsing.
fn last_note_marker(core: &Core<'_>) -> Value {
    let measure: Value = serde_json::from_str(
        core.parts
            .last()
            .unwrap()
            .measure_contents
            .last()
            .unwrap()
            .get(),
    )
    .unwrap();
    let note = &measure["voices"][0]["sequence"]["events"]
        .as_array()
        .unwrap()
        .last()
        .unwrap()["content"]["notes"][0];
    json!(format!(
        "observed:{}:{}",
        note["id"].as_str().unwrap(),
        note["writtenPitch"]["step"].as_str().unwrap()
    ))
}

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
    let request: ScopedCallbackRequestV1<'_, Core<'_>> =
        serde_json::from_slice(input).expect("guest JSON input");
    let result = execute(&request);
    let mut output = if matches!(&request.arguments, Args::CommandDecode(input) if input["payload"]["marker"] == "invalid-utf8")
    {
        b"{\"status\":\"decoded\",\"command\":\"\xff\"}".to_vec()
    } else {
        serde_json::to_vec(&result).unwrap()
    };
    let packed = ((output.as_mut_ptr() as u64) << 32) | output.len() as u64;
    std::mem::forget(output);
    packed
}

fn execute(request: &ScopedCallbackRequestV1<'_, Core<'_>>) -> Value {
    let source = request.module_id.as_str();
    let contribution = request.contribution_id.as_str();
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
    match &request.arguments {
        Args::CommandDecode(input) => {
            let payload = &input["payload"];
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
        Args::CommandPrepare(view, payload) => {
            let observed;
            let marker = if payload["marker"] == "read-dependency" {
                let read = &view.dependency_reads[0];
                assert_eq!(read["namespace"], "fixture.part");
                assert_eq!(read["provider"]["moduleId"], "fixture.part.module");
                let blocks = read["blocks"]
                    .as_array()
                    .expect("declared dependency blocks");
                assert!(blocks
                    .iter()
                    .all(|block| block["namespace"] == "fixture.part"
                        && block["owner"]["kind"] == "part"));
                &blocks.first().expect("dependency present")["payload"]["marker"]
            } else if payload["marker"] == "read-last-note" {
                observed = last_note_marker(&view.core_document);
                &observed
            } else {
                &payload["marker"]
            };
            let effect_namespace = if payload["marker"] == "foreign-write" {
                "fixture.part"
            } else {
                namespace
            };
            let address = if is_score {
                json!({"kind":"document","documentId":view.document_id})
            } else {
                json!({"kind":"part","partId":"part-1"})
            };
            json!({"status":"changed","effectRequests":[
                {"requestVersion":1,"requestKind":"core.note.replace-written-pitch","target":{"kind":"note","noteId":payload["noteId"]},"writtenPitch":payload["pitch"]},
                {"requestVersion":1,"requestKind":"module.extension","effectKind":format!("{effect_namespace}.replace"),
                    "namespace":effect_namespace,"owner":owner,"payload":{"schemaVersion":payload["schemaVersion"],"marker":marker}}],
                "affected":[{"kind":"note","noteId":payload["noteId"]},address]})
        }
        Args::EffectDecode(payload) => {
            if !payload["schemaVersion"].is_number() || !payload["marker"].is_string() {
                return json!({"status":"invalid"});
            }
            json!({"status":"decoded","payload":{"schemaVersion":payload["schemaVersion"],"marker":payload["marker"]}})
        }
        Args::EffectTransform(input) => {
            let payload = &input.payload;
            // Assert the host view excludes every other contribution's data.
            assert!(input
                .view
                .compatible_extensions
                .iter()
                .all(|block| block["namespace"] == namespace));
            json!({"status":"replace","schemaVersion":payload["schemaVersion"],"payload":{"marker":payload["marker"]}})
        }
        Args::Validate(view) => {
            let blocks = &view.compatible_extensions;
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
        Args::Classify(_) => json!({"status":"supported","issues":[]}),
    }
}
