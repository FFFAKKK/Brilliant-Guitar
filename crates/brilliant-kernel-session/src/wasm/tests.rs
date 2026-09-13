use super::*;

fn bytes(allocate: &str, execute: &str, extra: &str) -> Vec<u8> {
    wat::parse_str(format!(
        r#"(module
        (memory (export "memory") 1)
        (func (export "brilliant_alloc_v1") (param i32) (result i32) {allocate})
        (func (export "brilliant_execute_v1") (param i32 i32) (result i64) {execute})
        {extra})"#
    ))
    .unwrap()
}
fn capture(bytes: &[u8], limits: WasmLimitsV1) -> WasmExecutorV1 {
    WasmExecutorV1::capture(bytes, Sha256::digest(bytes).into(), 1, limits).unwrap()
}
fn echo() -> Vec<u8> {
    bytes(
        "i32.const 1024",
        "local.get 0 i64.extend_i32_u i64.const 32 i64.shl local.get 1 i64.extend_i32_u i64.or",
        "",
    )
}

#[test]
fn echo_preserves_lossless_bytes_and_deterministic_fuel() {
    let mut source = echo();
    let digest: [u8; 32] = Sha256::digest(&source).into();
    let executor = capture(&source, WasmLimitsV1::default());
    source.fill(0);
    assert_eq!(executor.sha256(), digest);
    let input = br#"{"opaque":"\ud800","negativeZero":-0,"number":0.10000000000000002}"#;
    let first = executor.execute_bounded(input).unwrap();
    assert_eq!(first.bytes, input);
    assert!(first.fuel_consumed > 0);
    assert_eq!(executor.execute_bounded(input).unwrap(), first);
    assert_eq!(executor.execute_bounded(b"").unwrap().bytes, b"");
}

#[test]
fn operation_transfers_share_exact_input_and_output_accounting_across_guests() {
    let first = capture(&echo(), WasmLimitsV1::default());
    let second = capture(&echo(), WasmLimitsV1::default());
    let mut budget = WasmOperationBudgetV1 {
        transfer_bytes: 12,
        ..Default::default()
    };
    for (guest, remaining) in [(&first, 6), (&second, 0)] {
        assert_eq!(budget.execute(guest, b"abc").unwrap().bytes, b"abc");
        assert_eq!(budget.transfer_bytes, remaining);
        assert!(!budget.failed());
    }
    // Empty payloads use calls/fuel but no transfer bytes, even at exact capacity.
    assert_eq!(budget.execute(&first, b"").unwrap().bytes, b"");
    assert_eq!(
        budget.execute(&second, b"x").err(),
        Some(WasmExecutionErrorV1::TransferLimitExceeded)
    );
    assert!(budget.failed());
    assert!(budget.execute(&first, b"").is_err());
    assert!(
        WasmOperationBudgetV1::default()
            .execute(&first, b"abc")
            .is_ok()
    );
}

#[test]
fn transfer_admission_precedes_guest_start_and_output_materialization() {
    let trap = capture(
        &bytes("unreachable", "i64.const 0", ""),
        WasmLimitsV1::default(),
    );
    let mut input_budget = WasmOperationBudgetV1 {
        transfer_bytes: 2,
        ..Default::default()
    };
    assert_eq!(
        input_budget.execute(&trap, b"abc").err(),
        Some(WasmExecutionErrorV1::TransferLimitExceeded)
    );
    assert_eq!(input_budget.calls, 4096); // No guest entered.
    assert!(input_budget.failed());

    let five = capture(
        &bytes("i32.const 1024", "i64.const 5", ""),
        WasmLimitsV1::default(),
    );
    let mut exact = WasmOperationBudgetV1 {
        transfer_bytes: 7,
        ..Default::default()
    };
    assert_eq!(exact.execute(&five, b"ab").unwrap().bytes, vec![0; 5]);
    assert_eq!(exact.transfer_bytes, 0);
    let mut short = WasmOperationBudgetV1 {
        transfer_bytes: 6,
        ..Default::default()
    };
    assert_eq!(
        short.execute(&five, b"ab").err(),
        Some(WasmExecutionErrorV1::TransferLimitExceeded)
    );
    assert!(short.failed());

    // Guest output points beyond memory: transfer admission happens before the
    // region is read/copied, and an over-budget return cannot allocate host data.
    let outside = capture(
        &bytes("i32.const 1024", "i64.const 281474976710661", ""),
        WasmLimitsV1::default(),
    );
    assert_eq!(
        outside.execute_bounded(b"ab").err(),
        Some(WasmExecutionErrorV1::InvalidOutputRegion)
    );
    let mut limited = WasmOperationBudgetV1 {
        transfer_bytes: 6,
        ..Default::default()
    };
    assert_eq!(
        limited.execute(&outside, b"ab").err(),
        Some(WasmExecutionErrorV1::TransferLimitExceeded)
    );
    assert!(limited.failed());
    // The shared budget must not weaken either original per-callback byte cap.
    for limits in [
        WasmLimitsV1 {
            input_bytes: 1,
            ..Default::default()
        },
        WasmLimitsV1 {
            output_bytes: 1,
            ..Default::default()
        },
    ] {
        let guest = capture(&echo(), limits);
        assert!(
            WasmOperationBudgetV1::default()
                .execute(&guest, b"ab")
                .is_err()
        );
    }
}

#[test]
fn shared_operation_fuel_is_consumed_across_guests_and_never_refreshed_per_call() {
    let first = capture(&echo(), WasmLimitsV1::default());
    let second = capture(&echo(), WasmLimitsV1::default());
    let cost = first.execute_bounded(b"payload").unwrap().fuel_consumed;
    let mut budget = WasmOperationBudgetV1 {
        fuel: cost * 2,
        calls: 3,
        ..Default::default()
    };
    assert_eq!(
        budget.execute(&first, b"payload").unwrap().bytes,
        b"payload"
    );
    assert_eq!(budget.fuel, cost);
    assert_eq!(
        budget.execute(&second, b"payload").unwrap().bytes,
        b"payload"
    );
    assert_eq!(budget.fuel, 0);
    assert!(!budget.failed()); // Exactly consuming a budget may finish successfully.
    assert_eq!(
        budget.execute(&first, b"payload").err(),
        Some(WasmExecutionErrorV1::FuelExhausted)
    );
    assert!(budget.failed());
    assert_eq!(
        budget.execute(&second, b"").err(),
        Some(WasmExecutionErrorV1::FuelExhausted)
    );

    let mut short = WasmOperationBudgetV1 {
        fuel: cost - 1,
        calls: 5,
        ..Default::default()
    };
    assert_eq!(
        short.execute(&first, b"payload").err(),
        Some(WasmExecutionErrorV1::FuelExhausted)
    );
    assert!(short.failed());
    assert!(
        WasmOperationBudgetV1::default()
            .execute(&first, b"payload")
            .is_ok()
    );
}

#[test]
fn operation_call_cap_and_guest_traps_remain_sticky_without_weakening_per_call_limits() {
    let normal = capture(&echo(), WasmLimitsV1::default());
    let mut budget = WasmOperationBudgetV1 {
        fuel: 100_000,
        calls: 1,
        ..Default::default()
    };
    assert!(budget.execute(&normal, b"ok").is_ok());
    assert_eq!(
        budget.execute(&normal, b"ok").err(),
        Some(WasmExecutionErrorV1::CallLimitExceeded)
    );
    assert!(budget.failed());
    let low = capture(
        &echo(),
        WasmLimitsV1 {
            fuel: 1,
            ..Default::default()
        },
    );
    let trap = capture(
        &bytes("unreachable", "i64.const 0", ""),
        WasmLimitsV1::default(),
    );
    for guest in [&low, &trap] {
        let mut budget = WasmOperationBudgetV1::default();
        assert!(budget.execute(guest, b"bad").is_err());
        assert!(budget.failed());
        assert!(budget.execute(&normal, b"must not run").is_err());
    }
}

#[test]
fn capture_checks_policy_integrity_module_and_version() {
    let module = echo();
    let hash = Sha256::digest(&module).into();
    assert_eq!(
        WasmExecutorV1::capture(&module, [0; 32], 1, WasmLimitsV1::default()).err(),
        Some(WasmExecutionErrorV1::HashMismatch)
    );
    assert_eq!(
        WasmExecutorV1::capture(&module, hash, 2, WasmLimitsV1::default()).err(),
        Some(WasmExecutionErrorV1::UnsupportedAbi)
    );
    for limits in [
        WasmLimitsV1 {
            fuel: 0,
            ..Default::default()
        },
        WasmLimitsV1 {
            memory_bytes: PAGE - 1,
            ..Default::default()
        },
        WasmLimitsV1 {
            fuel: 10_000_001,
            ..Default::default()
        },
        WasmLimitsV1 {
            memory_bytes: PAGE + 1,
            ..Default::default()
        },
    ] {
        assert_eq!(
            WasmExecutorV1::capture(&module, hash, 1, limits).err(),
            Some(WasmExecutionErrorV1::InvalidLimits)
        );
    }
    let too_big = vec![0; MAX_ARTIFACT_BYTES + 1];
    assert_eq!(
        WasmExecutorV1::capture(&too_big, [0; 32], 1, Default::default()).err(),
        Some(WasmExecutionErrorV1::ArtifactTooLarge)
    );
    assert_eq!(
        WasmExecutorV1::capture(b"bad", Sha256::digest(b"bad").into(), 1, Default::default()).err(),
        Some(WasmExecutionErrorV1::InvalidModule)
    );
}

#[test]
fn imports_and_abi_mismatches_fail_before_guest_start() {
    for declaration in [
        r#"(import "wasi_snapshot_preview1" "random_get" (func))"#,
        r#"(import "env" "write_document" (func))"#,
        r#"(import "env" "memory" (memory 1))"#,
    ] {
        let source = wat::parse_str(format!("(module {declaration})")).unwrap();
        assert_eq!(
            WasmExecutorV1::capture(
                &source,
                Sha256::digest(&source).into(),
                1,
                Default::default()
            )
            .err(),
            Some(WasmExecutionErrorV1::ImportsForbidden)
        );
    }
    for source in [
        bytes("i32.const 0", "i64.const 0", r#"(func (export "extra"))"#),
        wat::parse_str(
            r#"(module (memory (export "memory") 1)
            (func (export "brilliant_alloc_v1") (result i32) i32.const 0)
            (func (export "brilliant_execute_v1") (param i32 i32) (result i64) i64.const 0))"#,
        )
        .unwrap(),
    ] {
        assert_eq!(
            WasmExecutorV1::capture(
                &source,
                Sha256::digest(&source).into(),
                1,
                Default::default()
            )
            .err(),
            Some(WasmExecutionErrorV1::UnsupportedAbi)
        );
    }
}

#[test]
fn fuel_covers_start_allocation_and_execution() {
    let forever = "(loop br 0)";
    for source in [
        bytes(&format!("{forever} i32.const 0"), "i64.const 0", ""),
        bytes("i32.const 0", &format!("{forever} i64.const 0"), ""),
        bytes(
            "i32.const 0",
            "i64.const 0",
            &format!("(func $start {forever}) (start $start)"),
        ),
    ] {
        let executor = capture(
            &source,
            WasmLimitsV1 {
                fuel: 1000,
                ..Default::default()
            },
        );
        for _ in 0..2 {
            assert_eq!(
                executor.execute_bounded(b"x"),
                Err(WasmExecutionErrorV1::FuelExhausted)
            );
        }
    }
}

#[test]
fn memory_table_and_stack_exhaustion_trap_under_host_limits() {
    let limits = WasmLimitsV1 {
        memory_bytes: PAGE,
        ..Default::default()
    };
    for source in [
        bytes(
            "i32.const 0",
            "i32.const 1 memory.grow drop i64.const 0",
            "",
        ),
        bytes(
            "i32.const 0",
            "ref.null func i32.const 16385 table.grow drop i64.const 0",
            "(table 1 funcref)",
        ),
        bytes("i32.const 0", "i64.const 0", "(table 16385 funcref)"),
    ] {
        assert_eq!(
            capture(&source, limits).execute_bounded(b"x"),
            Err(WasmExecutionErrorV1::Trap)
        );
    }
    let recursive = bytes(
        "i32.const 0",
        "call $again i64.const 0",
        "(func $again call $again)",
    );
    assert_eq!(
        capture(&recursive, limits).execute_bounded(b"x"),
        Err(WasmExecutionErrorV1::StackExhausted)
    );
}

#[test]
fn fresh_instances_reset_globals_memory_and_failed_guest_state() {
    let source = bytes(
        "i32.const 1024",
        r#"
        global.get $counter i32.const 1 i32.add global.set $counter
        local.get 0 i32.load8_u i32.eqz if unreachable end
        i32.const 0 global.get $counter i32.store8
        i64.const 1"#,
        "(global $counter (mut i32) (i32.const 0))",
    );
    let executor = capture(&source, Default::default());
    for _ in 0..3 {
        assert_eq!(
            executor.execute_bounded(b"\0"),
            Err(WasmExecutionErrorV1::Trap)
        );
        assert_eq!(executor.execute_bounded(b"x").unwrap().bytes, [1]);
    }
}

#[test]
fn buffers_are_checked_before_copy_or_allocation() {
    let limits = WasmLimitsV1 {
        input_bytes: 4,
        output_bytes: 4,
        ..Default::default()
    };
    let executor = capture(&echo(), limits);
    assert_eq!(executor.execute_bounded(b"1234").unwrap().bytes, b"1234");
    assert_eq!(
        executor.execute_bounded(b"12345"),
        Err(WasmExecutionErrorV1::InputTooLarge)
    );
    for (alloc, execute, failure) in [
        (
            "i32.const -1",
            "i64.const 0",
            WasmExecutionErrorV1::InvalidInputRegion,
        ),
        (
            "i32.const 0",
            "i64.const 4294967295",
            WasmExecutionErrorV1::OutputTooLarge,
        ),
        (
            "i32.const 0",
            "i64.const -4294967295",
            WasmExecutionErrorV1::InvalidOutputRegion,
        ),
        (
            "i32.const 0",
            "i64.const 281470681743364",
            WasmExecutionErrorV1::InvalidOutputRegion,
        ),
    ] {
        assert_eq!(
            capture(&bytes(alloc, execute, ""), limits).execute_bounded(b"x"),
            Err(failure)
        );
    }
}

#[test]
fn compiler_limits_reject_excess_globals() {
    let source = bytes(
        "i32.const 0",
        "i64.const 0",
        &"(global i32 (i32.const 0))".repeat(1001),
    );
    assert_eq!(
        WasmExecutorV1::capture(
            &source,
            Sha256::digest(&source).into(),
            1,
            Default::default()
        )
        .err(),
        Some(WasmExecutionErrorV1::InvalidModule)
    );
}

fn session_fixture() -> serde_json::Value {
    serde_json::from_str(include_str!("fixtures/session.json")).unwrap()
}

// Protocol-only guest: dispatches by operation and whether the document has
// extensions. Replies were captured from the actual SDK for this one journey.
// This proves the executor/session seam, not a compiler or general guest validator.
fn protocol_guest(callbacks: &serde_json::Value) -> WasmExecutorV1 {
    let mut data = String::new();
    let mut cursor = 0;
    let mut put = |value: &str| {
        let start = cursor;
        let escaped: String = value
            .as_bytes()
            .iter()
            .map(|b| format!("\\{b:02x}"))
            .collect();
        data.push_str(&format!("(data (i32.const {start}) \"{escaped}\")\n"));
        cursor += value.len();
        (start, value.len())
    };
    let patterns: Vec<_> = [
        r#""operation":"prepare""#,
        r#""operation":"transform""#,
        r#""operation":"assess""#,
        r#""extensions":[]"#,
    ]
    .into_iter()
    .map(&mut put)
    .collect();
    let replies: Vec<_> = ["prepare", "transform", "assessEmpty", "assessPopulated"]
        .into_iter()
        .map(|key| put(callbacks[key].as_str().unwrap()))
        .collect();
    let check = |i: usize| {
        format!(
            "local.get 0 local.get 1 i32.const {} i32.const {} call $has",
            patterns[i].0, patterns[i].1
        )
    };
    let output = |i: usize| {
        format!(
            "i64.const {} return",
            ((replies[i].0 as u64) << 32) | replies[i].1 as u64
        )
    };
    let execute = format!(
        "{} if {} end {} if {} end {} if {} if {} else {} end end unreachable",
        check(0),
        output(0),
        check(1),
        output(1),
        check(2),
        check(3),
        output(2),
        output(3)
    );
    let matcher = r#"(func $has (param $base i32) (param $n i32) (param $key i32) (param $kn i32) (result i32)
        (local $i i32) (local $j i32)
        (block $no (loop $next
            local.get $i local.get $kn i32.add local.get $n i32.gt_u br_if $no
            i32.const 0 local.set $j
            (block $mismatch (loop $char
                local.get $j local.get $kn i32.ge_u if i32.const 1 return end
                local.get $base local.get $i i32.add local.get $j i32.add i32.load8_u
                local.get $key local.get $j i32.add i32.load8_u i32.ne br_if $mismatch
                local.get $j i32.const 1 i32.add local.set $j br $char))
            local.get $i i32.const 1 i32.add local.set $i br $next))
        i32.const 0)"#;
    let source = bytes("i32.const 32768", &execute, &format!("{matcher}\n{data}"));
    capture(&source, Default::default())
}

#[test]
fn wasm_executes_the_same_real_session_commit_undo_redo_journey_as_sdk() {
    let fixture = session_fixture();
    let mut executor = protocol_guest(&fixture["callbacks"]);
    let mut session = crate::IntegratedKernelSessionV2::create(
        fixture["initial"].as_str().unwrap().as_bytes(),
        &mut executor,
    )
    .unwrap();
    for step in fixture["journey"].as_array().unwrap() {
        let result = session.operate(step["request"].as_str().unwrap().as_bytes(), &mut executor);
        let expected: serde_json::Value =
            serde_json::from_str(step["response"].as_str().unwrap()).unwrap();
        let actual: serde_json::Value = serde_json::from_slice(&result).unwrap();
        assert_eq!(actual, expected, "{}", step["request"]);
    }
}

#[test]
fn guest_failure_and_invalid_replies_cannot_adopt_an_effective_batch_prefix() {
    let fixture = session_fixture();
    let command: serde_json::Value =
        serde_json::from_str(fixture["journey"][1]["request"].as_str().unwrap()).unwrap();
    let batch = serde_json::to_vec(&serde_json::json!({"operation":"submit", "command":{
        "commandVersion":1,"commandId":"core.transaction.batch","target":{"kind":"document","documentId":"score-1"},
        "payload":{"commands":[{"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-1"},
        "payload":{"writtenPitch":{"step":"E","alter":0,"octave":4}}}, command["command"]]}}})).unwrap();
    let infinite = bytes("i32.const 0", "(loop br 0) i64.const 0", "");
    let mut bad_executors = vec![capture(
        &infinite,
        WasmLimitsV1 {
            fuel: 1000,
            ..Default::default()
        },
    )];
    for field in ["prepare", "transform", "assessPopulated"] {
        let mut replies = fixture["callbacks"].clone();
        replies[field] = serde_json::Value::String("not-json".into());
        bad_executors.push(protocol_guest(&replies));
    }
    for mut bad in bad_executors {
        let mut good = protocol_guest(&fixture["callbacks"]);
        let mut session = crate::IntegratedKernelSessionV2::create(
            fixture["initial"].as_str().unwrap().as_bytes(),
            &mut good,
        )
        .unwrap();
        let mut before: serde_json::Value =
            serde_json::from_slice(&session.operate(br#"{"operation":"read"}"#, &mut good))
                .unwrap();
        let result: serde_json::Value =
            serde_json::from_slice(&session.operate(&batch, &mut bad)).unwrap();
        assert_eq!(result["ok"], false);
        assert!(result["result"]["events"].is_null());
        let mut after: serde_json::Value =
            serde_json::from_slice(&session.operate(br#"{"operation":"read"}"#, &mut good))
                .unwrap();
        // Attempt telemetry may increase. Document, version, history, checkpoint,
        // dirty state, availability and every other exposed read field may not.
        assert!(
            after["callbackProjections"].as_u64().unwrap()
                >= before["callbackProjections"].as_u64().unwrap()
        );
        before
            .as_object_mut()
            .unwrap()
            .remove("callbackProjections");
        after.as_object_mut().unwrap().remove("callbackProjections");
        assert_eq!(after, before);
        let restored: serde_json::Value =
            serde_json::from_slice(&session.operate(command.to_string().as_bytes(), &mut good))
                .unwrap();
        assert_eq!(restored["result"]["status"], "committed");
    }
}
