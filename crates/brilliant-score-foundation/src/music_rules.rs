use brilliant_core_types::{JS_SAFE_INTEGER_MAX, JsString, SafeInteger};

use crate::{
    ExactFraction, FractionV1, MeterV1, NoteValueV1, PitchStepV1, TimeModificationV1,
    TranspositionV1, WrittenPitchV1,
};

pub fn tempo_is_valid(bpm: f64) -> bool {
    bpm.is_finite() && bpm > 0.0
}

pub fn meter_denominator_is_valid(denominator: SafeInteger) -> bool {
    note_base(denominator.get() as f64)
}

pub fn assess_measure_duration(
    meter: &MeterV1,
    pickup: Option<&FractionV1>,
) -> Result<ExactFraction, &'static str> {
    measure_duration(
        meter.numerator.get() as f64,
        meter.denominator.get() as f64,
        pickup.map(|fraction| {
            (
                fraction.numerator.get() as f64,
                fraction.denominator.get() as f64,
            )
        }),
    )
}

pub fn assess_note_duration(value: &NoteValueV1) -> Result<ExactFraction, &'static str> {
    note_duration(
        value.base.get() as f64,
        value.dots.get() as f64,
        value.time_modification.as_ref().map(|modification| {
            (
                modification.actual_notes.get() as f64,
                modification.normal_notes.get() as f64,
            )
        }),
    )
}

fn pitch_step(step: PitchStepV1) -> &'static [u16] {
    match step {
        PitchStepV1::C => &[67],
        PitchStepV1::D => &[68],
        PitchStepV1::E => &[69],
        PitchStepV1::F => &[70],
        PitchStepV1::G => &[71],
        PitchStepV1::A => &[65],
        PitchStepV1::B => &[66],
    }
}

pub fn written_pitch_is_valid(pitch: &WrittenPitchV1) -> bool {
    written_pitch(
        pitch_step(pitch.step),
        pitch.alter.get() as f64,
        pitch.octave.get() as f64,
    )
}

/// The caller first checks `written_pitch_is_valid`. The typed transposition
/// already guarantees safe-integer components, just as the full walker guards.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SoundingPitchIssueV2 {
    Playback,
    Octave,
    Alter,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct SoundingPitchAssessmentV2 {
    pub(crate) sounding_semitone: i128,
    pub(crate) issue: Option<SoundingPitchIssueV2>,
}

/// Classifies the derived sounding pitch without requiring it to fit either a
/// JavaScript number or `WrittenPitchV1`. Typed inputs already guarantee valid
/// stored pitch and safe-integer transposition components.
pub(crate) fn assess_sounding_pitch_capability(
    pitch: &WrittenPitchV1,
    transposition: &TranspositionV1,
) -> SoundingPitchAssessmentV2 {
    let (step_index, natural_semitone) = match pitch.step {
        PitchStepV1::C => (0_i128, 0_i128),
        PitchStepV1::D => (1, 2),
        PitchStepV1::E => (2, 4),
        PitchStepV1::F => (3, 5),
        PitchStepV1::G => (4, 7),
        PitchStepV1::A => (5, 9),
        PitchStepV1::B => (6, 11),
    };
    let source_octave = i128::from(pitch.octave.get());
    let target_diatonic =
        source_octave * 7 + step_index + i128::from(transposition.diatonic_steps.get());
    let target_octave = target_diatonic.div_euclid(7);
    let target_step_index = target_diatonic.rem_euclid(7) as usize;
    let sounding_semitone = (source_octave + 1) * 12
        + natural_semitone
        + i128::from(pitch.alter.get())
        + i128::from(transposition.chromatic_semitones.get());
    let target_natural_semitone =
        (target_octave + 1) * 12 + [0_i128, 2, 4, 5, 7, 9, 11][target_step_index];
    let target_alter = sounding_semitone - target_natural_semitone;
    let issue = if !(0..=127).contains(&sounding_semitone) {
        Some(SoundingPitchIssueV2::Playback)
    } else if !(0..=8).contains(&target_octave) {
        Some(SoundingPitchIssueV2::Octave)
    } else if !(-2..=2).contains(&target_alter) {
        Some(SoundingPitchIssueV2::Alter)
    } else {
        None
    };
    SoundingPitchAssessmentV2 {
        sounding_semitone,
        issue,
    }
}

pub(crate) fn safe_integer(value: f64) -> bool {
    value.is_finite() && value.fract() == 0.0 && value.abs() <= JS_SAFE_INTEGER_MAX as f64
}

pub(crate) fn note_base(value: f64) -> bool {
    [1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0].contains(&value)
}

pub(crate) fn canonical_fraction(numerator: f64, denominator: f64) -> Option<ExactFraction> {
    if !safe_integer(numerator) || !safe_integer(denominator) {
        return None;
    }
    ExactFraction::from_canonical(&FractionV1 {
        numerator: SafeInteger::new(numerator as i64).ok()?,
        denominator: SafeInteger::new(denominator as i64).ok()?,
    })
    .ok()
}

pub(crate) fn measure_duration(
    numerator: f64,
    denominator: f64,
    pickup: Option<(f64, f64)>,
) -> Result<ExactFraction, &'static str> {
    if !safe_integer(numerator) || numerator <= 0.0 {
        return Err("meter-numerator-invalid");
    }
    if !note_base(denominator) {
        return Err("meter-denominator-invalid");
    }
    if let Some((n, d)) = pickup {
        return canonical_fraction(n, d)
            .filter(|value| value.numerator() > 0)
            .ok_or("pickup-duration-invalid");
    }
    ExactFraction::from_parts(numerator as i64, denominator as i64).map_err(|_| "fraction-overflow")
}

pub(crate) fn note_duration(
    base: f64,
    dots: f64,
    modification: Option<(f64, f64)>,
) -> Result<ExactFraction, &'static str> {
    if !note_base(base) {
        return Err("note-value-base-invalid");
    }
    if ![0.0, 1.0, 2.0, 3.0].contains(&dots) {
        return Err("note-value-dots-invalid");
    }
    let time_modification = if let Some((actual, normal)) = modification {
        if !safe_integer(actual) || !safe_integer(normal) || actual <= 0.0 || normal <= 0.0 {
            return Err("note-value-time-modification-invalid");
        }
        Some(TimeModificationV1 {
            actual_notes: SafeInteger::new(actual as i64).expect("validated positive count"),
            normal_notes: SafeInteger::new(normal as i64).expect("validated positive count"),
        })
    } else {
        None
    };
    ExactFraction::note_value_duration(&NoteValueV1 {
        base: SafeInteger::new(base as i64).expect("validated note base"),
        dots: SafeInteger::new(dots as i64).expect("validated dots"),
        time_modification,
    })
    .map_err(|_| "fraction-overflow")
}

pub(crate) fn written_pitch(step: &[u16], alter: f64, octave: f64) -> bool {
    matches!(step, [65..=71])
        && alter.fract() == 0.0
        && (-2.0..=2.0).contains(&alter)
        && octave.fract() == 0.0
        && (0.0..=8.0).contains(&octave)
}

pub(crate) fn extension_namespace(value: &JsString) -> bool {
    let mut count = 0;
    for segment in value.code_units().split(|unit| *unit == u16::from(b'.')) {
        count += 1;
        let mut units = segment.iter().copied();
        if !matches!(units.next(), Some(0x61..=0x7a))
            || !units.all(|unit| matches!(unit, 0x61..=0x7a | 0x30..=0x39 | 0x2d))
        {
            return false;
        }
    }
    count >= 2
}
