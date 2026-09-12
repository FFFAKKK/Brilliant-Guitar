//! Read-only SDK projections and effects use the ordinary transaction journal.
//! Projections are detached callback inputs, never a second live document owner.
use super::*;
use crate::change_set::StableExtensionOwnerV1;
use crate::overlay::ExtensionKeyV1;
use brilliant_score_foundation::{ExtensionBlockV1, ExtensionOwnerV1};
mod engine;
mod wire;
pub use engine::IntegratedKernelRuntimeV2;

impl KernelRuntime {
    pub fn commit_integrated_transaction(
        &mut self,
        command_id: StableId,
        prepared: KernelStage3PreparedV1,
    ) -> KernelStage4CommandResultV1 {
        let metrics = prepared.attempt_metrics;
        self.commit_prepared_mutation(
            KernelCommandIdentityV1::Module(command_id),
            PreparedMutationV1::Typed(prepared),
        )
        .unwrap_or_else(|failure| self.rejected_command(failure, metrics))
    }

    /// Preview stored operations for module assessment before moving the cursor.
    /// This does not invoke the original command preparer or effect transformer.
    pub fn preview_integrated_history(
        &self,
        redo: bool,
    ) -> Result<ScoreDocumentV1, KernelStage4FailureV1> {
        let entry = if redo {
            self.history.redo_entry()
        } else {
            self.history.undo_entry()
        }
        .map_err(map_history_failure)?;
        let HistoryPayloadV1::Typed(changes) = &entry.payload else {
            return Err(KernelStage4FailureV1::HistoryInvariantViolation);
        };
        let operations = if redo {
            &changes.forward
        } else {
            &changes.inverse
        };
        let overlay =
            crate::transaction::replay_overlay_on_base(&self.store, &changes.arena, operations)
                .map_err(|_| KernelStage4FailureV1::HistoryInvariantViolation)?;
        KernelStage3TransactionV1 { overlay }
            .integrated_projection(&self.store.header.id)
            .map_err(|failure| KernelStage4FailureV1::Command(failure.into()))
    }
}

impl KernelStage3TransactionV1<'_> {
    /// Materialize the complete current overlay because the existing SDK permits
    /// broad Core reads. Callers must count this as a full projection.
    pub fn integrated_projection(
        &mut self,
        document_id: &StableId,
    ) -> Result<ScoreDocumentV1, KernelStage3CommandFailureLeafV1> {
        let invalid = || KernelStage3CommandFailureLeafV1::LocalInvariantRejected;
        let Some(ScalarValueV1::DocumentMetadata(metadata)) =
            self.overlay
                .read_scalar(&ScalarAddressV1::DocumentMetadata {
                    document_id: document_id.clone(),
                })
        else {
            return Err(invalid());
        };
        let measure_ids = self
            .overlay
            .read_order(&StableOrderAddressV1::Measures {
                document_id: document_id.clone(),
            })
            .ok_or_else(invalid)?;
        let mut measure_definitions = Vec::new();
        measure_definitions
            .try_reserve(measure_ids.len())
            .map_err(|_| invalid())?;
        for measure_id in measure_ids {
            let Some(EntityBundleV1::Measure(bundle)) = self
                .overlay
                .read_entity(&StableEntityAddressV1::Measure { measure_id })
            else {
                return Err(invalid());
            };
            measure_definitions.push(bundle.definition);
        }
        let part_ids = self
            .overlay
            .read_order(&StableOrderAddressV1::Parts {
                document_id: document_id.clone(),
            })
            .ok_or_else(invalid)?;
        let mut parts = Vec::new();
        parts.try_reserve(part_ids.len()).map_err(|_| invalid())?;
        for part_id in part_ids {
            let Some(EntityBundleV1::Part(bundle)) = self
                .overlay
                .read_entity(&StableEntityAddressV1::Part { part_id })
            else {
                return Err(invalid());
            };
            parts.push(bundle.part);
        }
        let mut extensions = Vec::new();
        let mut failed = false;
        self.overlay
            .visit_extension_headers(&mut |header| {
                let key = ExtensionKeyV1 {
                    namespace: header.namespace.clone(),
                    owner: StableExtensionOwnerV1::from(&header.owner),
                };
                if let Some(block) = self.overlay.read_extension(&key)
                    && extensions.try_reserve(1).is_ok()
                {
                    extensions.push(block.value);
                    true
                } else {
                    failed = true;
                    false
                }
            })
            .map_err(|_| invalid())?;
        if failed {
            return Err(invalid());
        }
        Ok(ScoreDocumentV1 {
            schema_version: "brilliant-score-1".into(),
            id: document_id.clone(),
            metadata,
            measure_definitions,
            parts,
            extensions,
        })
    }

    /// Authority is checked by the integrated session before this typed effect.
    /// Replacement keeps its existing position; insertion appends in document order.
    pub fn set_integrated_extension(
        &mut self,
        namespace: JsString,
        owner: ExtensionOwnerV1,
        value: Option<ExtensionBlockV1>,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let key = ExtensionKeyV1 {
            namespace,
            owner: StableExtensionOwnerV1::from(&owner),
        };
        let current = self.overlay.read_extension(&key);
        let mutation = match (current, value) {
            (Some(_), Some(value)) => self.overlay.replace_extension(key, value),
            (Some(_), None) => self.overlay.remove_extension(key),
            (None, None) => Ok(OverlayMutationV1::NoOp),
            (None, Some(value)) => {
                if ExtensionKeyV1::from_block(&value) != key {
                    return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
                }
                let mut anchor = StableAnchorV1::Start;
                let mut failed = false;
                self.overlay
                    .visit_extension_headers(&mut |header| match header.anchor_id() {
                        Ok(sibling_id) => {
                            anchor = StableAnchorV1::After { sibling_id };
                            true
                        }
                        Err(_) => {
                            failed = true;
                            false
                        }
                    })
                    .map_err(|_| KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
                if failed {
                    return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
                }
                self.overlay.insert_extension(anchor, value)
            }
        };
        self.complete_single_effect(mutation)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixed_module_effects_share_the_rust_projection_history_and_origin() {
        let initial = crate::store::tests::fixture();
        let mut runtime = KernelRuntime::create(initial.clone()).unwrap();
        let mut transaction = runtime.begin_stage3_transaction();
        assert_eq!(
            transaction.integrated_projection(&initial.id).unwrap(),
            initial
        );
        transaction
            .set_note_written_pitch(
                StableId::new("note-a").unwrap(),
                WrittenPitchV1 {
                    step: PitchStepV1::D,
                    alter: SafeInteger::new(0).unwrap(),
                    octave: SafeInteger::new(4).unwrap(),
                },
            )
            .unwrap();
        let mut block = initial.extensions[0].clone();
        block.schema_version = SafeInteger::new(2).unwrap();
        transaction
            .set_integrated_extension(
                block.namespace.clone(),
                block.owner.clone(),
                Some(block.clone()),
            )
            .unwrap();
        let candidate = transaction.integrated_projection(&initial.id).unwrap();
        assert_eq!(candidate.extensions[0], block);
        assert_ne!(candidate, initial);
        let prepared = transaction.finish().unwrap();
        let command_id = StableId::new("example.edit").unwrap();
        let result = runtime.commit_integrated_transaction(command_id.clone(), prepared);
        let KernelStage4CommandResultV1::Committed { value, events } = result else {
            panic!("{result:?}");
        };
        assert_eq!(value.history.undo_depth, 1);
        assert_eq!(value.document_version.get(), 1);
        assert!(matches!(&events[0], KernelEventV1::DocumentCommitted {
            command_id: KernelCommandIdentityV1::Module(id), ..
        } if id == &command_id));
        assert_eq!(runtime.store.export_document().unwrap(), candidate);
        assert_eq!(runtime.preview_integrated_history(false).unwrap(), initial);
        for (redo, expected) in [(false, &initial), (true, &candidate)] {
            let result = if redo { runtime.redo() } else { runtime.undo() };
            let KernelStage4CommandResultV1::Committed { events, .. } = result else {
                panic!("{result:?}");
            };
            assert!(matches!(&events[0], KernelEventV1::DocumentCommitted {
                command_id: KernelCommandIdentityV1::Module(id), ..
            } if id == &command_id));
            assert_eq!(&runtime.store.export_document().unwrap(), expected);
        }
    }
}
