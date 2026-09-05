use brilliant_core_types::{JS_SAFE_INTEGER_MAX, SafeInteger};

use crate::{ExactFraction, FractionV1, NoteValueV1, TimeModificationV1};

pub fn tempo_is_valid(bpm: f64) -> bool {
    bpm.is_finite() && bpm > 0.0
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

pub(crate) fn written_pitch(step: &str, alter: f64, octave: f64) -> bool {
    ["C", "D", "E", "F", "G", "A", "B"].contains(&step)
        && alter.fract() == 0.0
        && (-2.0..=2.0).contains(&alter)
        && octave.fract() == 0.0
        && (0.0..=8.0).contains(&octave)
}

/// Inputs have passed the written-pitch and transposition component guards.
pub(crate) fn sounding_pitch(
    step: &str,
    alter: f64,
    octave: f64,
    diatonic: f64,
    chromatic: f64,
) -> Result<(), &'static str> {
    let source_step = ["C", "D", "E", "F", "G", "A", "B"]
        .iter()
        .position(|candidate| *candidate == step)
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

pub(crate) fn extension_namespace(value: &str) -> bool {
    let mut count = 0;
    for segment in value.split('.') {
        count += 1;
        let mut bytes = segment.bytes();
        if !bytes.next().is_some_and(|byte| byte.is_ascii_lowercase())
            || !bytes.all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        {
            return false;
        }
    }
    count >= 2
}
