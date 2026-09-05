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
pub fn assess_sounding_pitch(
    pitch: &WrittenPitchV1,
    transposition: &TranspositionV1,
) -> Result<(), &'static str> {
    sounding_pitch(
        pitch_step(pitch.step),
        pitch.alter.get() as f64,
        pitch.octave.get() as f64,
        transposition.diatonic_steps.get() as f64,
        transposition.chromatic_semitones.get() as f64,
    )
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

/// Inputs have passed the written-pitch and transposition component guards.
pub(crate) fn sounding_pitch(
    step: &[u16],
    alter: f64,
    octave: f64,
    diatonic: f64,
    chromatic: f64,
) -> Result<(), &'static str> {
    let source_step = [67, 68, 69, 70, 71, 65, 66]
        .iter()
        .position(|candidate| step == [*candidate])
        .ok_or("written-pitch-invalid")? as i64;
    let target_diatonic = octave as i64 * 7 + source_step + diatonic as i64;
    if !(-JS_SAFE_INTEGER_MAX..=JS_SAFE_INTEGER_MAX).contains(&target_diatonic) {
        return Err("transposition-component-invalid");
    }
    let target_octave = target_diatonic.div_euclid(7);
    if !(0..=8).contains(&target_octave) {
        return Err("derived-pitch-octave-out-of-range");
    }
    let natural = [0_i64, 2, 4, 5, 7, 9, 11];
    let target_chromatic =
        octave as i64 * 12 + natural[source_step as usize] + alter as i64 + chromatic as i64;
    if !(-JS_SAFE_INTEGER_MAX..=JS_SAFE_INTEGER_MAX).contains(&target_chromatic) {
        return Err("transposition-component-invalid");
    }
    let target_alter =
        target_chromatic - (target_octave * 12 + natural[target_diatonic.rem_euclid(7) as usize]);
    if !(-2..=2).contains(&target_alter) {
        return Err("derived-pitch-alter-out-of-range");
    }
    Ok(())
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
