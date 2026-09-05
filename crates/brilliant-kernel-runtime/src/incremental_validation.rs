use brilliant_core_types::{StablePathSegmentV1, StablePathV1};
use brilliant_score_foundation::{
    CoreDiagnosticCodeV1, CoreDiagnosticV1, ScoreMetadataV1, tempo_is_valid,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct SemanticValidationFailureV1 {
    pub(crate) diagnostics: Vec<CoreDiagnosticV1>,
    pub(crate) rules_evaluated: u64,
}

/// The metadata dependency is its final tempo scalar only. Title/author edits
/// schedule no musical work, and intermediate batch values are not assessed.
/// Other dependency families are added independently; this never calls the
/// full JSON reference walker or materializes the score.
pub(crate) fn validate_final_metadata(
    base: &ScoreMetadataV1,
    candidate: Option<&ScoreMetadataV1>,
) -> Result<u64, SemanticValidationFailureV1> {
    let Some(candidate) = candidate else {
        return Ok(0);
    };
    if candidate.tempo == base.tempo {
        return Ok(0);
    }
    let rules_evaluated = 1;
    if tempo_is_valid(candidate.tempo.bpm.get()) {
        return Ok(rules_evaluated);
    }
    let path = StablePathV1::new(
        ["metadata", "tempo", "bpm"]
            .map(|field| StablePathSegmentV1::Field(field.to_owned()))
            .to_vec(),
    )
    .expect("fixed metadata diagnostic path");
    Err(SemanticValidationFailureV1 {
        diagnostics: vec![CoreDiagnosticV1::new(
            CoreDiagnosticCodeV1::TempoInvalid,
            path,
            None,
        )],
        rules_evaluated,
    })
}
