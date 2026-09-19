//! Typed kernel effects emitted by extension command preparation.
//!
//! Extensions describe domain intent over the wire. The kernel converts each
//! accepted request into a small typed effect before it reaches a transaction.
//! This keeps plugin policy outside the Store while keeping mutation semantics
//! inside the kernel.
use super::*;
use crate::runtime::effect::KernelEffectV1;
use brilliant_kernel_contracts::decode_admission_command_value;

type EffectDecodeResult<T> =
    std::result::Result<T, brilliant_kernel_contracts::KernelStage3CommandFailureLeafV1>;

fn decode_failure_leaf(
    failure: brilliant_kernel_contracts::KernelStage3CommandFailureV1,
) -> brilliant_kernel_contracts::KernelStage3CommandFailureLeafV1 {
    match failure {
        brilliant_kernel_contracts::KernelStage3CommandFailureV1::Leaf(failure) => failure,
        brilliant_kernel_contracts::KernelStage3CommandFailureV1::BatchChildRejected { .. } => {
            brilliant_kernel_contracts::KernelStage3CommandFailureLeafV1::InvalidEnvelope
        }
    }
}

fn decode_command_request(
    request: &Value,
    fields: &[&str],
    request_kind: &str,
    command_id: &str,
    payload_fields: &[(&str, &str)],
) -> EffectDecodeResult<CoreCommandEnvelopeV1> {
    use brilliant_kernel_contracts::KernelStage3CommandFailureLeafV1 as Failure;

    if !exact(request, fields) || !tag(request, "requestKind", request_kind) {
        return Err(Failure::InvalidEnvelope);
    }
    let request_version =
        integer(field(request, "requestVersion").map_err(|_| Failure::InvalidEnvelope)?)
            .ok_or(Failure::InvalidEnvelope)?;
    if request_version != 1 {
        return Err(Failure::UnsupportedVersion);
    }
    let mut payload = Vec::new();
    for (output, input) in payload_fields {
        payload.push((
            *output,
            field(request, input)
                .map_err(|_| Failure::InvalidEnvelope)?
                .clone(),
        ));
    }
    decode_admission_command_value(&object([
        ("commandVersion", number(1)),
        ("commandId", text(command_id)),
        (
            "target",
            field(request, "target")
                .map_err(|_| Failure::InvalidEnvelope)?
                .clone(),
        ),
        (
            "payload",
            JsonValue::Object(
                payload
                    .into_iter()
                    .map(|(key, value)| (key.into(), value))
                    .collect(),
            ),
        ),
    ]))
    .map_err(decode_failure_leaf)?
    .try_into_stable()
    .map_err(|_| Failure::InvalidEnvelope)
}

impl KernelEffectV1 {
    pub(super) fn decode_core(request: &Value) -> EffectDecodeResult<Option<Self>> {
        use brilliant_kernel_contracts::KernelStage3CommandFailureLeafV1 as Failure;

        let kind = match field(request, "requestKind") {
            Ok(value) => string(value).map_err(|_| Failure::InvalidEnvelope)?,
            Err(_) => return Err(Failure::InvalidEnvelope),
        };
        let command = if kind.eq_ascii("core.note.replace-written-pitch") {
            decode_command_request(
                request,
                &["requestVersion", "requestKind", "target", "writtenPitch"],
                "core.note.replace-written-pitch",
                "core.note.set-written-pitch",
                &[("writtenPitch", "writtenPitch")],
            )?
        } else if kind.eq_ascii("core.document.set-metadata") {
            decode_command_request(
                request,
                &["requestVersion", "requestKind", "target", "metadata"],
                "core.document.set-metadata",
                "core.document.set-metadata",
                &[("metadata", "metadata")],
            )?
        } else if kind.eq_ascii("core.event.set-note-value") {
            decode_command_request(
                request,
                &["requestVersion", "requestKind", "target", "noteValue"],
                "core.event.set-note-value",
                "core.event.set-note-value",
                &[("noteValue", "noteValue")],
            )?
        } else if kind.eq_ascii("core.voice.insert-notes-event") {
            decode_command_request(
                request,
                &["requestVersion", "requestKind", "target", "anchor", "event"],
                "core.voice.insert-notes-event",
                "core.voice.insert-notes-event",
                &[("anchor", "anchor"), ("event", "event")],
            )?
        } else if kind.eq_ascii("core.voice.insert-rest-event") {
            decode_command_request(
                request,
                &["requestVersion", "requestKind", "target", "anchor", "event"],
                "core.voice.insert-rest-event",
                "core.voice.insert-rest-event",
                &[("anchor", "anchor"), ("event", "event")],
            )?
        } else if kind.eq_ascii("core.event.remove") {
            decode_command_request(
                request,
                &["requestVersion", "requestKind", "target"],
                "core.event.remove",
                "core.event.remove",
                &[],
            )?
        } else {
            return Ok(None);
        };
        let effect = match command {
            CoreCommandEnvelopeV1::DocumentSetMetadata {
                target: ScoreEntityTargetV1::Document { document_id },
                metadata,
            } => Self::SetDocumentMetadata {
                document_id,
                metadata,
            },
            CoreCommandEnvelopeV1::NoteSetWrittenPitch {
                target: ScoreEntityTargetV1::Note { note_id },
                written_pitch,
            } => Self::ReplaceWrittenPitch {
                note_id,
                pitch: written_pitch,
            },
            CoreCommandEnvelopeV1::EventSetNoteValue {
                target: ScoreEntityTargetV1::Event { event_id },
                note_value,
            } => Self::SetEventNoteValue {
                event_id,
                note_value,
            },
            CoreCommandEnvelopeV1::VoiceInsertNotesEvent {
                target: ScoreEntityTargetV1::Voice { voice_id },
                anchor,
                event,
            } => Self::InsertNotesEvent {
                voice_id,
                anchor,
                event,
            },
            CoreCommandEnvelopeV1::VoiceInsertRestEvent {
                target: ScoreEntityTargetV1::Voice { voice_id },
                anchor,
                event,
            } => Self::InsertRestEvent {
                voice_id,
                anchor,
                event,
            },
            CoreCommandEnvelopeV1::EventRemove {
                target: ScoreEntityTargetV1::Event { event_id },
            } => Self::RemoveEvent { event_id },
            _ => return Err(Failure::InvalidEnvelope),
        };
        Ok(Some(effect))
    }

    pub(super) fn decode_extension(
        namespace: brilliant_core_types::JsString,
        owner: ExtensionOwnerV1,
        supported_schema_versions: &Value,
        transformed: &Value,
    ) -> EffectDecodeResult<Self> {
        use brilliant_kernel_contracts::KernelStage3CommandFailureLeafV1 as Failure;

        let block = if tag(transformed, "status", "remove") && exact(transformed, &["status"]) {
            None
        } else if tag(transformed, "status", "replace")
            && exact(transformed, &["status", "schemaVersion", "payload"])
        {
            let version =
                integer(field(transformed, "schemaVersion").map_err(|_| Failure::InvalidEnvelope)?)
                    .ok_or(Failure::InvalidEnvelope)?;
            if !array(supported_schema_versions)
                .map_err(|_| Failure::InternalError)?
                .iter()
                .any(|value| integer(value) == Some(version))
            {
                return Err(Failure::UnsupportedVersion);
            }
            Some(
                ExtensionBlockV1::from_lossless_value(object([
                    ("namespace", JsonValue::String(namespace.clone())),
                    ("owner", value(&owner).map_err(|_| Failure::InternalError)?),
                    (
                        "schemaVersion",
                        field(transformed, "schemaVersion")
                            .map_err(|_| Failure::InvalidEnvelope)?
                            .clone(),
                    ),
                    (
                        "payload",
                        field(transformed, "payload")
                            .map_err(|_| Failure::InvalidEnvelope)?
                            .clone(),
                    ),
                ]))
                .map_err(|_| Failure::InvalidEnvelope)?,
            )
        } else {
            return Err(Failure::InvalidEnvelope);
        };
        Ok(Self::SetExtension {
            namespace,
            owner,
            block,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pitch_request_is_decoded_into_a_typed_kernel_effect() {
        let request = decode(
            br#"{"requestVersion":1,"requestKind":"core.note.replace-written-pitch","target":{"kind":"note","noteId":"note-1"},"writtenPitch":{"step":"C","alter":0,"octave":4}}"#,
        )
        .expect("valid effect request");
        let effect = KernelEffectV1::decode_core(&request)
            .expect("typed effect")
            .expect("core effect");
        assert!(matches!(
            effect,
            KernelEffectV1::ReplaceWrittenPitch { note_id, pitch }
                if note_id.as_js_string() == "note-1"
                    && pitch.step == PitchStepV1::C
                    && pitch.alter.get() == 0
                    && pitch.octave.get() == 4
        ));
    }

    #[test]
    fn pitch_request_rejects_extra_fields_before_transaction_access() {
        let request = decode(
            br#"{"requestVersion":1,"requestKind":"core.note.replace-written-pitch","target":{"kind":"note","noteId":"note-1"},"writtenPitch":{"step":"C","alter":0,"octave":4},"extra":true}"#,
        )
        .expect("json");
        assert_eq!(
            KernelEffectV1::decode_core(&request),
            Err(KernelStage3CommandFailureLeafV1::InvalidEnvelope)
        );
    }

    #[test]
    fn core_effect_decode_preserves_version_and_target_failure_codes() {
        let unsupported = decode(
            br#"{"requestVersion":2,"requestKind":"core.event.remove","target":{"kind":"event","eventId":"event-1"}}"#,
        )
        .expect("future request");
        assert_eq!(
            KernelEffectV1::decode_core(&unsupported),
            Err(KernelStage3CommandFailureLeafV1::UnsupportedVersion)
        );

        let wrong_target = decode(
            br#"{"requestVersion":1,"requestKind":"core.event.remove","target":{"kind":"note","noteId":"note-1"}}"#,
        )
        .expect("wrong target request");
        assert_eq!(
            KernelEffectV1::decode_core(&wrong_target),
            Err(KernelStage3CommandFailureLeafV1::TargetMismatch)
        );
    }

    #[test]
    fn every_local_core_effect_request_uses_the_closed_command_decoder() {
        let cases = [
            (
                br#"{"requestVersion":1,"requestKind":"core.document.set-metadata","target":{"kind":"document","documentId":"score-1"},"metadata":{"title":"Next","authors":[],"tempo":{"bpm":120}}}"#.as_slice(),
                "metadata",
            ),
            (
                br#"{"requestVersion":1,"requestKind":"core.event.set-note-value","target":{"kind":"event","eventId":"event-1"},"noteValue":{"base":8,"dots":0}}"#.as_slice(),
                "note-value",
            ),
            (
                br#"{"requestVersion":1,"requestKind":"core.voice.insert-notes-event","target":{"kind":"voice","voiceId":"voice-1"},"anchor":{"kind":"start"},"event":{"id":"event-new","duration":{"base":4,"dots":0},"content":{"kind":"notes","notes":[{"id":"note-new","writtenPitch":{"step":"D","alter":0,"octave":4}}]}}}"#.as_slice(),
                "notes-event",
            ),
            (
                br#"{"requestVersion":1,"requestKind":"core.voice.insert-rest-event","target":{"kind":"voice","voiceId":"voice-1"},"anchor":{"kind":"start"},"event":{"id":"event-new","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}}"#.as_slice(),
                "rest-event",
            ),
            (
                br#"{"requestVersion":1,"requestKind":"core.event.remove","target":{"kind":"event","eventId":"event-1"}}"#.as_slice(),
                "remove-event",
            ),
        ];
        for (bytes, expected) in cases {
            let request = decode(bytes).expect("request");
            let effect = KernelEffectV1::decode_core(&request)
                .expect("valid request")
                .expect("core request");
            assert!(matches!(
                (expected, effect),
                ("metadata", KernelEffectV1::SetDocumentMetadata { .. })
                    | ("note-value", KernelEffectV1::SetEventNoteValue { .. })
                    | ("notes-event", KernelEffectV1::InsertNotesEvent { .. })
                    | ("rest-event", KernelEffectV1::InsertRestEvent { .. })
                    | ("remove-event", KernelEffectV1::RemoveEvent { .. })
            ));
        }
    }

    #[test]
    fn extension_effect_materializes_replace_and_remove_without_store_access() {
        let supported = decode(br#"[1,2]"#).expect("versions");
        let replaced =
            decode(br#"{"status":"replace","schemaVersion":2,"payload":{"finger":"2"}}"#)
                .expect("replacement");
        let effect = KernelEffectV1::decode_extension(
            "guitar.fingering".into(),
            ExtensionOwnerV1::Score,
            &supported,
            &replaced,
        )
        .expect("replace effect");
        assert!(matches!(
            effect,
            KernelEffectV1::SetExtension {
                namespace,
                owner: ExtensionOwnerV1::Score,
                block: Some(block),
            } if namespace == "guitar.fingering"
                && block.schema_version.get() == 2
        ));

        let removed = decode(br#"{"status":"remove"}"#).expect("removal");
        assert!(matches!(
            KernelEffectV1::decode_extension(
                "guitar.fingering".into(),
                ExtensionOwnerV1::Score,
                &supported,
                &removed,
            ),
            Ok(KernelEffectV1::SetExtension { block: None, .. })
        ));
    }

    #[test]
    fn extension_effect_rejects_unlisted_versions_and_extra_fields() {
        let supported = decode(br#"[1,2]"#).expect("versions");
        let unsupported = decode(br#"{"status":"replace","schemaVersion":3,"payload":{}}"#)
            .expect("unsupported replacement");
        assert_eq!(
            KernelEffectV1::decode_extension(
                "guitar.fingering".into(),
                ExtensionOwnerV1::Score,
                &supported,
                &unsupported,
            ),
            Err(KernelStage3CommandFailureLeafV1::UnsupportedVersion)
        );

        let malformed = decode(br#"{"status":"remove","extra":true}"#).expect("extended removal");
        assert_eq!(
            KernelEffectV1::decode_extension(
                "guitar.fingering".into(),
                ExtensionOwnerV1::Score,
                &supported,
                &malformed,
            ),
            Err(KernelStage3CommandFailureLeafV1::InvalidEnvelope)
        );
    }

    #[derive(Default)]
    struct RecordingEffectTransaction {
        pitch: Option<(StableId, WrittenPitchV1)>,
        extension: Option<(brilliant_core_types::JsString, ExtensionOwnerV1)>,
    }

    impl crate::runtime::effect::KernelEffectTransaction for RecordingEffectTransaction {
        fn set_document_metadata(
            &mut self,
            _: StableId,
            _: ScoreMetadataV1,
        ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
            Ok(())
        }

        fn set_event_note_value(
            &mut self,
            _: StableId,
            _: NoteValueV1,
        ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
            Ok(())
        }

        fn remove_event(
            &mut self,
            _: StableId,
        ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
            Ok(())
        }

        fn insert_notes_event(
            &mut self,
            _: StableId,
            _: SequenceAnchorV1,
            _: RhythmicEventV1,
        ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
            Ok(())
        }

        fn insert_rest_event(
            &mut self,
            _: StableId,
            _: SequenceAnchorV1,
            _: RhythmicEventV1,
        ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
            Ok(())
        }

        fn replace_written_pitch(
            &mut self,
            note_id: StableId,
            pitch: WrittenPitchV1,
        ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
            self.pitch = Some((note_id, pitch));
            Ok(())
        }

        fn set_extension(
            &mut self,
            namespace: brilliant_core_types::JsString,
            owner: ExtensionOwnerV1,
            _: Option<ExtensionBlockV1>,
        ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
            self.extension = Some((namespace, owner));
            Ok(())
        }
    }

    #[test]
    fn typed_effect_applies_through_a_write_only_transaction_boundary() {
        let note_id = StableId::new("note-1").expect("id");
        let pitch = WrittenPitchV1 {
            step: PitchStepV1::D,
            alter: brilliant_core_types::SafeInteger::new(0).expect("alter"),
            octave: brilliant_core_types::SafeInteger::new(4).expect("octave"),
        };
        let mut transaction = RecordingEffectTransaction::default();
        KernelEffectV1::ReplaceWrittenPitch {
            note_id: note_id.clone(),
            pitch: pitch.clone(),
        }
        .apply_to(&mut transaction)
        .expect("effect applies");

        assert_eq!(transaction.pitch, Some((note_id, pitch)));
        assert!(transaction.extension.is_none());
    }
}
