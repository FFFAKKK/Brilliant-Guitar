//! Expected payloads come only from immutable prefix data or recorded module
//! writes, never by copying arbitrary current candidate extension state.
use super::*;
use crate::{
    change_set::{AnchoredExtensionBlockV1, StableAnchorV1},
    overlay::{ExtensionHeaderV1, ExtensionKeyV1},
};
use brilliant_score_foundation::ExtensionOwnerV1;

fn header_key(header: &ExtensionHeaderV1) -> ExtensionKeyV1 {
    ExtensionKeyV1 {
        namespace: header.namespace.clone(),
        owner: (&header.owner).into(),
    }
}

fn predecessor_id(
    header: &ExtensionHeaderV1,
    reservation: &mut Reservation,
) -> Result<StableId, Failure> {
    let (prefix, part) = match &header.owner {
        ExtensionOwnerV1::Score => ("extension:score:", None),
        ExtensionOwnerV1::Part { part_id } => ("extension:part:", Some(part_id.as_js_string())),
    };
    let capacity = prefix
        .len()
        .checked_add(header.namespace.code_units().len())
        .and_then(|size| {
            part.map_or(Some(size), |part| {
                size.checked_add(part.code_units().len())?.checked_add(1)
            })
        })
        .ok_or(Failure::InternalError)?;
    let mut units = Vec::new();
    reservation.vec(Site::JournalOperations, &mut units, capacity)?;
    units.extend(prefix.encode_utf16());
    if let Some(part) = part {
        units.extend_from_slice(part.code_units());
        units.push(b':' as u16);
    }
    units.extend_from_slice(header.namespace.code_units());
    StableId::new(JsString::from_utf16(units)).map_err(|_| Failure::InternalError)
}

impl Recorder<'_> {
    pub(super) fn prefix_extension_belongs_to(
        &self,
        header: &ExtensionHeaderV1,
        root: &Occurrence,
    ) -> bool {
        let ExtensionOwnerV1::Part { part_id } = &header.owner else {
            return false;
        };
        if self.candidate.raw_id(root) != Some(part_id.as_js_string()) {
            return false;
        }
        let original = Entity::Part {
            part_id: part_id.clone(),
        };
        let had_owner =
            self.candidate.prefix.frozen_resolve_entity_address(part_id) == Some(original.clone());
        match root {
            Occurrence::Prefix(entity) => had_owner && entity.as_ref() == &original,
            Occurrence::Added(_) if !had_owner => {
                // Originally dangling references may be repaired by a unique
                // later Part; they have no former occurrence to transfer from.
                let Some(indices) = self
                    .candidate
                    .added
                    .get(&Kind::Part)
                    .and_then(|parts| parts.get(part_id.as_js_string()))
                else {
                    return false;
                };
                let mut visible = indices
                    .iter()
                    .map(|index| Occurrence::Added(*index))
                    .filter(|source| self.candidate.visible(source));
                visible.next().as_ref() == Some(root) && visible.next().is_none()
            }
            _ => false,
        }
    }

    pub(super) fn expected_part_extensions(
        &mut self,
        root: &Occurrence,
    ) -> Result<Vec<AnchoredExtensionBlockV1>, Failure> {
        self.candidate.reservation.ensure_active()?;
        if self.candidate.kind(root) != Some(Kind::Part) || !self.candidate.visible(root) {
            return Err(Failure::InternalError);
        }
        if self.extension_ledger.is_some() {
            return self.ledger_part_extensions(root);
        }
        let mut expected = Vec::new();
        let mut previous: Option<ExtensionHeaderV1> = None;
        let mut failure = None;
        let mut reservation = std::mem::take(&mut self.candidate.reservation);
        let visited = self
            .candidate
            .prefix
            .visit_extension_headers(&mut |header| {
                let key = header_key(header);
                if self.recorded_extension_deaths.contains(&key) {
                    return true;
                }
                if self.prefix_extension_belongs_to(header, root) {
                    let entry = (|| {
                        reservation.vec(Site::JournalOperations, &mut expected, 1)?;
                        let anchor = match &previous {
                            Some(previous) => StableAnchorV1::After {
                                sibling_id: predecessor_id(previous, &mut reservation)?,
                            },
                            None => StableAnchorV1::Start,
                        };
                        let mut value = self
                            .candidate
                            .prefix
                            .read_extension(&key)
                            .ok_or(Failure::InternalError)?;
                        if ExtensionKeyV1::from_block(&value.value) != key {
                            return Err(Failure::InternalError);
                        }
                        value.anchor = anchor;
                        Ok(value)
                    })();
                    match entry {
                        Ok(value) => expected.push(value),
                        Err(error) => {
                            failure = Some(error);
                            return false;
                        }
                    }
                }
                previous = Some(header.clone());
                true
            });
        self.candidate.reservation = reservation;
        self.candidate.reservation.ensure_active()?;
        visited.map_err(|_| Failure::InternalError)?;
        if let Some(error) = failure {
            return Err(error);
        }
        Ok(expected)
    }

    pub(super) fn reserve_recorded_extension_deaths(
        &mut self,
        blocks: &[AnchoredExtensionBlockV1],
    ) -> Result<(), Failure> {
        self.candidate.reservation.set(
            Site::JournalOperations,
            &mut self.recorded_extension_deaths,
            blocks.len(),
        )
    }

    pub(super) fn record_extension_deaths(&mut self, blocks: &[AnchoredExtensionBlockV1]) {
        if let Some(ledger) = &mut self.extension_ledger {
            ledger.remove(blocks);
        }
        for block in blocks {
            self.recorded_extension_deaths
                .insert(ExtensionKeyV1::from_block(&block.value));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{build_live_score_store, tests::fixture};

    #[test]
    fn unrecorded_extension_cannot_become_a_part_removal_history_payload() {
        let document = fixture();
        let store = build_live_score_store(&document).unwrap();
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let raw = document.parts[0].id.as_js_string().clone();
        let root = recorder.candidate.resolve(Kind::Part, &raw).unwrap();
        let mut extension = document.extensions[0].clone();
        extension.namespace = "unrecorded.part-data".into();
        extension.owner = ExtensionOwnerV1::Part {
            part_id: document.parts[0].id.clone(),
        };
        recorder
            .candidate
            .insert_part_extensions(
                &root,
                &[AnchoredExtensionBlockV1 {
                    anchor: StableAnchorV1::Start,
                    value: extension,
                }],
            )
            .unwrap();
        assert_eq!(recorder.remove_part(&raw), Err(Failure::InternalError));
        assert!(recorder.candidate.visible(&root));
        assert!(recorder.steps.is_empty());
        assert!(recorder.recorded_extension_deaths.is_empty());
        assert!(recorder.finish().is_err());
        assert_eq!(store.export_document().unwrap(), document);
    }
}
