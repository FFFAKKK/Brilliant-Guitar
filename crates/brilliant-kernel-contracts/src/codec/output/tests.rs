use super::*;
use brilliant_core_types::{DocumentVersionV1, JsString, SafeInteger, StableId, StablePathV1};
use brilliant_score_foundation::{CoreDiagnosticCodeV1, CoreDiagnosticV1, ScoreDocumentV1};
use serde::Serialize;

fn encoded(value: &impl LosslessEncode) -> Vec<u8> {
    let mut output = Vec::new();
    value.write_lossless(&mut output).unwrap();
    output
}

fn scalar_parity(value: &(impl LosslessEncode + Serialize)) {
    assert_eq!(encoded(value), serde_json::to_vec(value).unwrap());
}

fn document() -> ScoreDocumentV1 {
    serde_json::from_value(serde_json::json!({
        "schemaVersion": "1", "id": "score/🎸",
        "metadata": {"title": "score/线路", "authors": ["a\u{301}"], "tempo": {"bpm": 120}},
        "measureDefinitions": [], "parts": [], "extensions": []
    }))
    .unwrap()
}

fn mutation() -> KernelStage4MutationValueV1 {
    KernelStage4MutationValueV1 {
        document_version: DocumentVersionV1::initial(),
        affected: vec![ScoreEntityTargetV1::Note {
            note_id: StableId::new("note/🎸").unwrap().into(),
        }],
        history: KernelHistoryStateV1 {
            undo_depth: 1,
            redo_depth: 0,
        },
        dirty: true,
        metrics: KernelStage3MetricsV1::default(),
        stage4_metrics: KernelStage4MetricsV1::default(),
    }
}

#[test]
fn boundary_and_command_failure_wire_order_matches_serde() {
    use StableFailureV1::*;
    for failure in [
        BridgeCaptureInvalid,
        BridgeRequestTooLarge {
            limit_bytes: 7,
            actual_bytes: 8,
        },
        CodecInvalidUtf8,
        CodecInvalidJson,
        CodecInvalidShape {
            path: StablePathV1::root(),
            violation: ShapeViolationV1::InvalidTag,
        },
        ContractUnsupportedApiVersion {
            supported_version: 1,
        },
        ContractUnsupportedProtocolVersion {
            supported_version: 1,
        },
        ScoreUnsupportedSchema {
            supported_schema: "1",
        },
        ScoreInvalidStructure {
            path: StablePathV1::root(),
            violation: ScoreStructureViolationV1::InvalidReference,
        },
        CodecDepthLimit {
            limit: 2,
            actual: 3,
        },
        CodecPropertyLimit {
            limit: 4,
            actual: 5,
        },
        CodecNumberOutOfRange {
            path: StablePathV1::root(),
        },
        BridgeHandleUnknown,
        BridgeHandleStale,
        BridgeHandleWrongEnvironment,
        BridgeHandleWrongThread,
        BridgeHandleReentrant,
        BridgeHandleBusy,
        BridgeHandlePoisoned,
        BridgeResponseTooLarge {
            limit_bytes: 9,
            actual_bytes: 10,
        },
        BridgePanicContained,
        BridgeInternal,
    ] {
        scalar_parity(&KernelSessionCreateResultV1::Rejected(failure.clone()));
        scalar_parity(&KernelSessionReadResultV1::Rejected(failure.clone()));
        scalar_parity(&KernelStage3SubmitResultV1::Rejected(failure.clone()));
        scalar_parity(&KernelStage4OperationResultV1::Rejected(failure.clone()));
        scalar_parity(&KernelStage4ReplayResultV1::InvalidInitialDocument(failure));
    }
    use KernelStage3CommandFailureLeafV1::*;
    for leaf in [
        SemanticInvalid {
            diagnostics: vec![CoreDiagnosticV1::new(
                CoreDiagnosticCodeV1::IdDuplicate,
                StablePathV1::root(),
                Some(("id", &JsString::from("note/🎸"))),
            )],
        },
        InvalidEnvelope,
        UnsupportedVersion,
        UnknownId,
        TargetMismatch,
        TargetNotFound,
        AnchorNotFound,
        AnchorWrongOwner,
        AnchorSelfReference,
        ReferenceConflict,
        InvalidRange,
        RangeEndpointNotFound,
        RangeOwnerMismatch,
        RangeTransformInvalid {
            address: NoteAddressV1::Note {
                note_id: StableId::new("note").unwrap().into(),
            },
            reason: PitchTranspositionErrorV1::DerivedPitchAlterOutOfRange,
        },
        BatchEmpty,
        BatchNested,
        ResourceLimitExceeded {
            limit_kind: KernelStage3ResourceLimitKindV1::Effects,
            limit: 1,
            actual: 2,
        },
        VersionOverflow,
        InternalError,
        LocalInvariantRejected,
    ] {
        scalar_parity(&leaf);
        scalar_parity(&KernelStage3CommandFailureV1::BatchChildRejected {
            failed_command_index: 2,
            failure: leaf.clone(),
        });
        scalar_parity(&KernelStage3SubmitResultV1::CommandRejected {
            value: KernelStage3SubmitRejectedValueV1 {
                document_version: DocumentVersionV1::initial(),
                metrics: Default::default(),
            },
            failure: leaf.into(),
        });
    }
}

#[test]
fn response_statuses_events_snapshot_null_and_replay_omission_match_serde() {
    let value = mutation();
    scalar_parity(&KernelSessionCreateResultV1::Created(
        KernelSessionCreateSuccessValueV1 {
            document_id: document().id,
            document_version: value.document_version,
        },
    ));
    scalar_parity(&KernelSessionReadResultV1::Ok(Box::new(initial_snapshot(
        document(),
    ))));
    scalar_parity(&KernelStage3SubmitResultV1::Committed(
        KernelStage3SubmitSuccessValueV1 {
            document_version: value.document_version,
            affected: value.affected.clone(),
            metrics: value.metrics,
        },
    ));
    scalar_parity(&KernelStage3SubmitResultV1::NoOp(
        KernelStage3SubmitNoOpValueV1 {
            document_version: value.document_version,
            metrics: value.metrics,
        },
    ));
    let events = vec![
        KernelEventV1::DocumentCommitted {
            event_sequence: 1,
            document_id: document().id,
            document_version: value.document_version,
            cause: KernelEventCauseV1::Submit,
            command_id: CoreCommandIdV1::PartSetName.into(),
            affected_entities: value.affected.clone(),
        },
        KernelEventV1::DirtyStateChanged {
            event_sequence: 2,
            document_id: document().id,
            document_version: value.document_version,
            cause: KernelEventCauseV1::MarkPersisted,
            dirty: false,
        },
    ];
    for result in [
        KernelStage4CommandResultV1::Committed {
            value: value.clone(),
            events: events.clone(),
        },
        KernelStage4CommandResultV1::NoOp {
            value: value.clone(),
        },
        KernelStage4CommandResultV1::Rejected {
            value: KernelStage4RejectedValueV1 {
                document_version: value.document_version,
                history: value.history,
                dirty: value.dirty,
                metrics: value.metrics,
                stage4_metrics: value.stage4_metrics,
            },
            failure: KernelStage4FailureV1::HistoryEmptyUndo,
        },
    ] {
        scalar_parity(&KernelStage4OperationResultV1::Command(result));
    }
    let mark = KernelStage4MarkPersistedValueV1 {
        document_version: value.document_version,
        dirty: false,
    };
    for result in [
        KernelStage4MarkPersistedResultV1::Updated {
            value: mark.clone(),
            events,
        },
        KernelStage4MarkPersistedResultV1::NoOp {
            value: mark.clone(),
        },
        KernelStage4MarkPersistedResultV1::Rejected {
            value: mark,
            failure: KernelStage4FailureV1::CheckpointInvalid,
        },
    ] {
        scalar_parity(&KernelStage4OperationResultV1::MarkPersisted(result));
    }
    for snapshot_document in [None, Some(SharedScoreDocumentV1::new(document()))] {
        let read = KernelStage4ReadResultV1::Ok(Box::new(KernelStage4ReadStateV1 {
            snapshot: KernelStage4SnapshotV1 {
                document_id: document().id,
                schema_version: "1",
                document_version: value.document_version,
                document: snapshot_document,
            },
            history: value.history,
            dirty: value.dirty,
            stage4_metrics: value.stage4_metrics,
        }));
        scalar_parity(&KernelStage4OperationResultV1::Read(read));
    }
    scalar_parity(&KernelStage4OperationResultV1::Read(
        KernelStage4ReadResultV1::Rejected(KernelStage4FailureV1::ReadInvalidSnapshot),
    ));
    let results = vec![
        KernelStage4ReplayCommandResultV1 {
            status: "no-op",
            document_version: value.document_version,
            history: value.history,
            failure: None,
        },
        KernelStage4ReplayCommandResultV1 {
            status: "command-rejected",
            document_version: value.document_version,
            history: value.history,
            failure: Some(KernelStage4FailureV1::Command(
                KernelStage3CommandFailureLeafV1::TargetNotFound.into(),
            )),
        },
    ];
    scalar_parity(&KernelStage4ReplayResultV1::Replayed {
        final_document: document(),
        document_version: value.document_version,
        results: results.clone(),
    });
    scalar_parity(&KernelStage4ReplayResultV1::Rejected {
        final_document: document(),
        document_version: value.document_version,
        results,
        failed_command_index: 1,
        failure: KernelStage4FailureV1::ReadInvalidRange,
    });
}

#[test]
fn selectors_preserve_tags_flattening_and_range_field_order() {
    for selection in [
        KernelSelectorValueV1::Overview(ScoreOverviewV1 {
            document_id: StableId::new("score/overview").unwrap(),
            title: "Overview".into(),
            measure_count: SafeInteger::new(2).unwrap(),
        }),
        KernelSelectorValueV1::Metadata(document().metadata),
        KernelSelectorValueV1::Entity(SelectedScoreEntityV1::Document(document())),
        KernelSelectorValueV1::Ownership(ScoreEntityOwnershipV1::Note {
            document_id: StableId::new("d").unwrap(),
            part_id: StableId::new("p").unwrap(),
            measure_id: StableId::new("m").unwrap(),
            voice_id: StableId::new("v").unwrap(),
            event_id: StableId::new("e").unwrap(),
        }),
        KernelSelectorValueV1::Range(ScoreRangeSelectionV1::VoiceEventRange {
            normalized: ScoreRangeV1::VoiceEventRange {
                start: VoiceEventPointV1 {
                    kind: VoiceEventPointKindV1::VoiceEvent,
                    voice_id: StableId::new("v").unwrap(),
                    event_id: StableId::new("e1").unwrap(),
                },
                end: VoiceEventPointV1 {
                    kind: VoiceEventPointKindV1::VoiceEvent,
                    voice_id: StableId::new("v").unwrap(),
                    event_id: StableId::new("e2").unwrap(),
                },
            },
            events: vec![],
        }),
        KernelSelectorValueV1::History(KernelHistoryStateV1 {
            undo_depth: 2,
            redo_depth: 3,
        }),
        KernelSelectorValueV1::Dirty(true),
    ] {
        scalar_parity(&KernelStage4OperationResultV1::Select(
            KernelStage4SelectResultV1 {
                value: KernelStage4SelectValueV1 {
                    document_version: DocumentVersionV1::initial(),
                    selection: KernelSelectorResultV1::Ok(selection),
                    stage4_metrics: Default::default(),
                },
            },
        ));
    }
    scalar_parity(&KernelSelectorResultV1::Rejected(
        KernelStage4FailureV1::ReadEntityNotFound,
    ));
}

#[test]
fn score_overview_preserves_utf16_titles_losslessly() {
    let overview = KernelSelectorValueV1::Overview(ScoreOverviewV1 {
        document_id: StableId::new("score/overview").unwrap(),
        title: JsString::from_utf16(vec![0xd800, b'/' as u16, 0xdc00]),
        measure_count: SafeInteger::new(2).unwrap(),
    });

    assert_eq!(
        String::from_utf8(encoded(&overview)).unwrap(),
        r#"{"documentId":"score/overview","title":"\ud800/\udc00","measureCount":2}"#
    );
}

#[test]
fn surrogate_ids_and_semantic_details_are_written_without_scalar_conversion() {
    let text = JsString::from_utf16(vec![0xd800, b'/' as u16, 0xdc00]);
    let id = StableId::new(text.clone()).unwrap();
    let created = KernelSessionCreateResultV1::Created(KernelSessionCreateSuccessValueV1 {
        document_id: id.clone(),
        document_version: DocumentVersionV1::initial(),
    });
    let wire = String::from_utf8(encoded(&created)).unwrap();
    assert!(wire.contains(r#""documentId":"\ud800/\udc00""#));
    let address = ScoreEntityTargetV1::Note {
        note_id: AffectedEntityIdV1::from(id),
    };
    assert_eq!(
        String::from_utf8(encoded(&address)).unwrap(),
        r#"{"kind":"note","noteId":"\ud800/\udc00"}"#
    );
    let semantic = KernelStage3CommandFailureLeafV1::SemanticInvalid {
        diagnostics: vec![CoreDiagnosticV1::new(
            CoreDiagnosticCodeV1::IdDuplicate,
            StablePathV1::root(),
            Some(("id", &text)),
        )],
    };
    let nested = KernelStage4FailureV1::Command(KernelStage3CommandFailureV1::BatchChildRejected {
        failed_command_index: 3,
        failure: semantic,
    });
    assert!(
        String::from_utf8(encoded(&nested))
            .unwrap()
            .contains(r#""details":{"id":"\ud800/\udc00"}"#)
    );
}

#[test]
fn write_failures_propagate_from_nested_responses() {
    struct Refuse;
    impl Write for Refuse {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("refused"))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let result = KernelSessionReadResultV1::Ok(Box::new(initial_snapshot(document())));
    assert!(result.write_lossless(&mut Refuse).is_err());
}
