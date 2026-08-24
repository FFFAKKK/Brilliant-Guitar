use std::cmp::Ordering;

use brilliant_core_types::{JS_SAFE_INTEGER_MAX, SafeInteger};

use crate::{FractionV1, NoteValueV1};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ExactFractionError {
    NonCanonical,
    InvalidNoteValue,
    Overflow,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ExactFraction {
    numerator: i64,
    denominator: i64,
}

impl ExactFraction {
    pub fn from_canonical(value: &FractionV1) -> Result<Self, ExactFractionError> {
        let numerator = value.numerator.get();
        let denominator = value.denominator.get();
        if denominator <= 0
            || (numerator == 0 && denominator != 1)
            || (numerator != 0 && gcd_i128(i128::from(numerator), i128::from(denominator)) != 1)
        {
            return Err(ExactFractionError::NonCanonical);
        }
        Ok(Self {
            numerator,
            denominator,
        })
    }

    pub fn from_parts(numerator: i64, denominator: i64) -> Result<Self, ExactFractionError> {
        if !(-JS_SAFE_INTEGER_MAX..=JS_SAFE_INTEGER_MAX).contains(&numerator)
            || !(1..=JS_SAFE_INTEGER_MAX).contains(&denominator)
        {
            return Err(ExactFractionError::Overflow);
        }
        reduce(i128::from(numerator), i128::from(denominator))
    }

    pub fn checked_compare(self, other: Self) -> Result<Ordering, ExactFractionError> {
        let left = i128::from(self.numerator)
            .checked_mul(i128::from(other.denominator))
            .ok_or(ExactFractionError::Overflow)?;
        let right = i128::from(other.numerator)
            .checked_mul(i128::from(self.denominator))
            .ok_or(ExactFractionError::Overflow)?;
        Ok(left.cmp(&right))
    }

    pub fn checked_add(self, other: Self) -> Result<Self, ExactFractionError> {
        let denominator_gcd = gcd_i128(i128::from(self.denominator), i128::from(other.denominator));
        let left_scale = i128::from(other.denominator) / denominator_gcd;
        let right_scale = i128::from(self.denominator) / denominator_gcd;
        let left = i128::from(self.numerator)
            .checked_mul(left_scale)
            .ok_or(ExactFractionError::Overflow)?;
        let right = i128::from(other.numerator)
            .checked_mul(right_scale)
            .ok_or(ExactFractionError::Overflow)?;
        let numerator = left
            .checked_add(right)
            .ok_or(ExactFractionError::Overflow)?;
        let denominator = i128::from(self.denominator)
            .checked_mul(left_scale)
            .ok_or(ExactFractionError::Overflow)?;
        reduce(numerator, denominator)
    }

    pub fn note_value_duration(value: &NoteValueV1) -> Result<Self, ExactFractionError> {
        let base = value.base.get();
        let dots = value.dots.get();
        if !matches!(base, 1 | 2 | 4 | 8 | 16 | 32 | 64) || !(0..=3).contains(&dots) {
            return Err(ExactFractionError::InvalidNoteValue);
        }

        let dot_denominator = 1_i128
            .checked_shl(u32::try_from(dots).map_err(|_| ExactFractionError::InvalidNoteValue)?)
            .ok_or(ExactFractionError::Overflow)?;
        let dot_numerator = dot_denominator
            .checked_mul(2)
            .and_then(|value| value.checked_sub(1))
            .ok_or(ExactFractionError::Overflow)?;
        let mut result = multiply(
            i128::from(1),
            i128::from(base),
            dot_numerator,
            dot_denominator,
        )?;

        if let Some(modification) = &value.time_modification {
            let actual = modification.actual_notes.get();
            let normal = modification.normal_notes.get();
            if actual <= 0 || normal <= 0 {
                return Err(ExactFractionError::InvalidNoteValue);
            }
            result = multiply(
                i128::from(result.numerator),
                i128::from(result.denominator),
                i128::from(normal),
                i128::from(actual),
            )?;
        }
        Ok(result)
    }

    pub const fn numerator(self) -> i64 {
        self.numerator
    }

    pub const fn denominator(self) -> i64 {
        self.denominator
    }

    pub fn to_fraction_v1(self) -> FractionV1 {
        FractionV1 {
            numerator: SafeInteger::new(self.numerator).expect("validated exact numerator"),
            denominator: SafeInteger::new(self.denominator).expect("validated exact denominator"),
        }
    }
}

fn multiply(
    left_numerator: i128,
    left_denominator: i128,
    right_numerator: i128,
    right_denominator: i128,
) -> Result<ExactFraction, ExactFractionError> {
    if left_denominator <= 0 || right_denominator <= 0 {
        return Err(ExactFractionError::NonCanonical);
    }
    let left_cross = gcd_i128(left_numerator, right_denominator);
    let right_cross = gcd_i128(right_numerator, left_denominator);
    let numerator = (left_numerator / left_cross)
        .checked_mul(right_numerator / right_cross)
        .ok_or(ExactFractionError::Overflow)?;
    let denominator = (left_denominator / right_cross)
        .checked_mul(right_denominator / left_cross)
        .ok_or(ExactFractionError::Overflow)?;
    reduce(numerator, denominator)
}

fn reduce(numerator: i128, denominator: i128) -> Result<ExactFraction, ExactFractionError> {
    if denominator <= 0 {
        return Err(ExactFractionError::NonCanonical);
    }
    if numerator == 0 {
        return Ok(ExactFraction {
            numerator: 0,
            denominator: 1,
        });
    }
    let divisor = gcd_i128(numerator, denominator);
    let numerator = numerator / divisor;
    let denominator = denominator / divisor;
    let safe_limit = i128::from(JS_SAFE_INTEGER_MAX);
    if !(-safe_limit..=safe_limit).contains(&numerator) || !(1..=safe_limit).contains(&denominator)
    {
        return Err(ExactFractionError::Overflow);
    }
    Ok(ExactFraction {
        numerator: i64::try_from(numerator).map_err(|_| ExactFractionError::Overflow)?,
        denominator: i64::try_from(denominator).map_err(|_| ExactFractionError::Overflow)?,
    })
}

fn gcd_i128(left: i128, right: i128) -> i128 {
    let mut left = left.abs();
    let mut right = right.abs();
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left
}

#[cfg(test)]
mod tests {
    use brilliant_core_types::SafeInteger;

    use super::*;
    use crate::TimeModificationV1;

    fn safe(value: i64) -> SafeInteger {
        SafeInteger::new(value).expect("safe integer")
    }

    fn note(base: i64, dots: i64, modification: Option<(i64, i64)>) -> NoteValueV1 {
        NoteValueV1 {
            base: safe(base),
            dots: safe(dots),
            time_modification: modification.map(|(actual, normal)| TimeModificationV1 {
                actual_notes: safe(actual),
                normal_notes: safe(normal),
            }),
        }
    }

    #[test]
    fn canonical_fraction_validation_preserves_sign_and_zero_laws() {
        assert_eq!(
            ExactFraction::from_canonical(&FractionV1 {
                numerator: safe(0),
                denominator: safe(1),
            }),
            ExactFraction::from_parts(0, 1)
        );
        assert_eq!(
            ExactFraction::from_canonical(&FractionV1 {
                numerator: safe(2),
                denominator: safe(4),
            }),
            Err(ExactFractionError::NonCanonical)
        );
        assert_eq!(
            ExactFraction::from_canonical(&FractionV1 {
                numerator: safe(0),
                denominator: safe(2),
            }),
            Err(ExactFractionError::NonCanonical)
        );
    }

    #[test]
    fn checked_compare_and_add_are_exact_and_gcd_reduced() {
        let one_sixth = ExactFraction::from_parts(1, 6).expect("fraction");
        let one_third = ExactFraction::from_parts(1, 3).expect("fraction");
        assert_eq!(one_sixth.checked_compare(one_third), Ok(Ordering::Less));
        assert_eq!(
            one_sixth.checked_add(one_third),
            ExactFraction::from_parts(1, 2)
        );
    }

    #[test]
    fn note_value_duration_covers_dots_and_tuplets() {
        assert_eq!(
            ExactFraction::note_value_duration(&note(4, 1, None)),
            ExactFraction::from_parts(3, 8)
        );
        assert_eq!(
            ExactFraction::note_value_duration(&note(8, 0, Some((3, 2)))),
            ExactFraction::from_parts(1, 12)
        );
    }

    #[test]
    fn note_value_and_addition_reject_invalid_or_unsafe_results() {
        assert_eq!(
            ExactFraction::note_value_duration(&note(3, 0, None)),
            Err(ExactFractionError::InvalidNoteValue)
        );
        assert_eq!(
            ExactFraction::note_value_duration(&note(1, 3, Some((1, JS_SAFE_INTEGER_MAX)))),
            Err(ExactFractionError::Overflow)
        );
        assert_eq!(
            ExactFraction::from_parts(JS_SAFE_INTEGER_MAX + 1, 2),
            Err(ExactFractionError::Overflow)
        );
        assert_eq!(
            ExactFraction::from_parts(JS_SAFE_INTEGER_MAX, 1)
                .expect("maximum")
                .checked_add(ExactFraction::from_parts(1, 1).expect("one")),
            Err(ExactFractionError::Overflow)
        );
    }
}
