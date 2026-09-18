//! Typed kernel effects emitted by extension command preparation.
//!
//! Extensions describe domain intent over the wire. The kernel converts each
//! accepted request into a small typed effect before it reaches a transaction.
//! This keeps plugin policy outside the Store while keeping mutation semantics
//! inside the kernel.
use super::*;
use crate::runtime::effect::KernelEffectV1;

impl KernelEffectV1 {
    pub(super) fn decode_written_pitch(
        request: &Value,
        invalid: impl Fn() -> Value,
    ) -> Result<Self> {
        if !exact(
            request,
            &["requestVersion", "requestKind", "target", "writtenPitch"],
        ) || !tag(request, "requestKind", "core.note.replace-written-pitch")
            || integer(field(request, "requestVersion")?) != Some(1)
        {
            return Err(invalid());
        }
        let target = field(request, "target")?;
        if !exact(target, &["kind", "noteId"]) || !tag(target, "kind", "note") {
            return Err(invalid());
        }
        let note_id = StableId::new(string(field(target, "noteId")?)?).map_err(|_| invalid())?;
        let pitch = WrittenPitchV1::from_lossless_value(field(request, "writtenPitch")?.clone())
            .map_err(|_| invalid())?;
        if !brilliant_score_foundation::written_pitch_is_valid(&pitch) {
            return Err(invalid());
        }
        Ok(Self::ReplaceWrittenPitch { note_id, pitch })
    }

    pub(super) fn decode_extension(
        namespace: brilliant_core_types::JsString,
        owner: ExtensionOwnerV1,
        supported_schema_versions: &Value,
        transformed: &Value,
        invalid: impl Fn() -> Value,
    ) -> Result<Self> {
        let block = if tag(transformed, "status", "remove") && exact(transformed, &["status"]) {
            None
        } else if tag(transformed, "status", "replace")
            && exact(transformed, &["status", "schemaVersion", "payload"])
        {
            let version = integer(field(transformed, "schemaVersion")?).ok_or_else(&invalid)?;
            if !array(supported_schema_versions)?
                .iter()
                .any(|value| integer(value) == Some(version))
            {
                return Err(invalid());
            }
            Some(
                ExtensionBlockV1::from_lossless_value(object([
                    ("namespace", JsonValue::String(namespace.clone())),
                    ("owner", value(&owner).map_err(|_| invalid())?),
                    (
                        "schemaVersion",
                        field(transformed, "schemaVersion")?.clone(),
                    ),
                    ("payload", field(transformed, "payload")?.clone()),
                ]))
                .map_err(|_| invalid())?,
            )
        } else {
            return Err(invalid());
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
        let effect =
            KernelEffectV1::decode_written_pitch(&request, internal).expect("typed effect");
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
        assert!(KernelEffectV1::decode_written_pitch(&request, internal).is_err());
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
            internal,
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
                internal,
            ),
            Ok(KernelEffectV1::SetExtension { block: None, .. })
        ));
    }

    #[test]
    fn extension_effect_rejects_unlisted_versions_and_extra_fields() {
        let supported = decode(br#"[1,2]"#).expect("versions");
        for transformed in [
            decode(br#"{"status":"replace","schemaVersion":3,"payload":{}}"#)
                .expect("unsupported replacement"),
            decode(br#"{"status":"remove","extra":true}"#).expect("extended removal"),
        ] {
            assert!(
                KernelEffectV1::decode_extension(
                    "guitar.fingering".into(),
                    ExtensionOwnerV1::Score,
                    &supported,
                    &transformed,
                    internal,
                )
                .is_err()
            );
        }
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
