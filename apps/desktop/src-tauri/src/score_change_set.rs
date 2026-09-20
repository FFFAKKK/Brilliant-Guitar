use sha2::{Digest, Sha256};

use crate::dto::{
    ScoreMetadataSnapshotV1, ScoreMetadataTransactionChangeSetV1,
    ScoreMetadataTransactionOperationV1, ScoreMetadataV1, ScoreTempoChangeSetV1,
};

pub(crate) const SCORE_TEMPO_CHANGE_KIND: &str = "score-tempo";
pub(crate) const SCORE_METADATA_TRANSACTION_KIND: &str = "score-metadata-transaction";
const TEMPO_CHANGE_SET_HASH_DOMAIN: &[u8] = b"brilliant-score-tempo-change-set-v1\0";
const METADATA_TRANSACTION_HASH_DOMAIN: &[u8] = b"brilliant-score-metadata-transaction-v1\0";

fn valid_tempo_bpm(value: f64) -> bool {
    value.is_finite() && value > 0.0
}

fn tempo_change_set_id(
    document_id: &str,
    base_document_version: u64,
    before_tempo_bpm: f64,
    after_tempo_bpm: f64,
) -> String {
    let mut digest = Sha256::new();
    digest.update(TEMPO_CHANGE_SET_HASH_DOMAIN);
    digest.update(document_id.as_bytes());
    digest.update([0]);
    digest.update(base_document_version.to_be_bytes());
    digest.update(before_tempo_bpm.to_bits().to_be_bytes());
    digest.update(after_tempo_bpm.to_bits().to_be_bytes());
    format!("sha256:{:x}", digest.finalize())
}

pub fn tempo_change_set(current: &ScoreMetadataV1, after_tempo_bpm: f64) -> ScoreTempoChangeSetV1 {
    ScoreTempoChangeSetV1 {
        change_set_id: tempo_change_set_id(
            &current.document_id,
            current.document_version,
            current.tempo_bpm,
            after_tempo_bpm,
        ),
        kind: SCORE_TEMPO_CHANGE_KIND.into(),
        document_id: current.document_id.clone(),
        base_document_version: current.document_version,
        before_tempo_bpm: current.tempo_bpm,
        after_tempo_bpm,
    }
}

pub fn valid_tempo_change_set(value: &ScoreTempoChangeSetV1) -> bool {
    value.kind == SCORE_TEMPO_CHANGE_KIND
        && !value.document_id.is_empty()
        && value.document_id.encode_utf16().count() <= 256
        && valid_tempo_bpm(value.before_tempo_bpm)
        && valid_tempo_bpm(value.after_tempo_bpm)
        && value.before_tempo_bpm != value.after_tempo_bpm
        && value.change_set_id
            == tempo_change_set_id(
                &value.document_id,
                value.base_document_version,
                value.before_tempo_bpm,
                value.after_tempo_bpm,
            )
}

fn metadata_transaction_operations(
    before: &ScoreMetadataSnapshotV1,
    after: &ScoreMetadataSnapshotV1,
) -> Vec<ScoreMetadataTransactionOperationV1> {
    let mut operations = Vec::with_capacity(2);
    if before.title != after.title {
        operations.push(ScoreMetadataTransactionOperationV1::SetTitle);
    }
    if before.tempo_bpm != after.tempo_bpm {
        operations.push(ScoreMetadataTransactionOperationV1::SetTempo);
    }
    operations
}

fn hash_string(digest: &mut Sha256, value: &str) {
    digest.update((value.len() as u64).to_be_bytes());
    digest.update(value.as_bytes());
}

fn metadata_transaction_change_set_id(
    document_id: &str,
    base_document_version: u64,
    before: &ScoreMetadataSnapshotV1,
    after: &ScoreMetadataSnapshotV1,
) -> String {
    let mut digest = Sha256::new();
    digest.update(METADATA_TRANSACTION_HASH_DOMAIN);
    hash_string(&mut digest, document_id);
    digest.update(base_document_version.to_be_bytes());
    hash_string(&mut digest, &before.title);
    digest.update(before.tempo_bpm.to_bits().to_be_bytes());
    hash_string(&mut digest, &after.title);
    digest.update(after.tempo_bpm.to_bits().to_be_bytes());
    format!("sha256:{:x}", digest.finalize())
}

pub fn metadata_transaction_change_set(
    current: &ScoreMetadataV1,
    title: Option<String>,
    tempo_bpm: Option<f64>,
) -> ScoreMetadataTransactionChangeSetV1 {
    let before = ScoreMetadataSnapshotV1 {
        title: current.title.clone(),
        tempo_bpm: current.tempo_bpm,
    };
    let after = ScoreMetadataSnapshotV1 {
        title: title.unwrap_or_else(|| before.title.clone()),
        tempo_bpm: tempo_bpm.unwrap_or(before.tempo_bpm),
    };
    let operations = metadata_transaction_operations(&before, &after);
    ScoreMetadataTransactionChangeSetV1 {
        change_set_id: metadata_transaction_change_set_id(
            &current.document_id,
            current.document_version,
            &before,
            &after,
        ),
        kind: SCORE_METADATA_TRANSACTION_KIND.into(),
        document_id: current.document_id.clone(),
        base_document_version: current.document_version,
        operations,
        before,
        after,
    }
}

fn valid_metadata_snapshot(value: &ScoreMetadataSnapshotV1) -> bool {
    value.title.trim() == value.title
        && !value.title.is_empty()
        && value.title.encode_utf16().count() <= 120
        && valid_tempo_bpm(value.tempo_bpm)
}

pub fn valid_metadata_transaction_change_set(value: &ScoreMetadataTransactionChangeSetV1) -> bool {
    value.kind == SCORE_METADATA_TRANSACTION_KIND
        && !value.document_id.is_empty()
        && value.document_id.encode_utf16().count() <= 256
        && valid_metadata_snapshot(&value.before)
        && valid_metadata_snapshot(&value.after)
        && !value.operations.is_empty()
        && value.operations == metadata_transaction_operations(&value.before, &value.after)
        && value.change_set_id
            == metadata_transaction_change_set_id(
                &value.document_id,
                value.base_document_version,
                &value.before,
                &value.after,
            )
}
