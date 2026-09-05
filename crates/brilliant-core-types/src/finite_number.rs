use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer, de};

use crate::{CoreTypeFailure, JS_SAFE_INTEGER_MAX, SafeInteger};

/// A finite JSON/JavaScript number. Counts, versions and exact time components
/// use SafeInteger instead; opaque data and tempo must also preserve decimals.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FiniteNumber(f64);

// NaN is unrepresentable, and both zero signs are normalized on construction.
impl Eq for FiniteNumber {}

impl FiniteNumber {
    pub fn new(value: f64) -> Result<Self, CoreTypeFailure> {
        if value.is_finite() {
            Ok(Self(if value == 0.0 { 0.0 } else { value }))
        } else {
            Err(CoreTypeFailure::NumberOutOfRange)
        }
    }

    pub const fn get(self) -> f64 {
        self.0
    }
}

impl From<SafeInteger> for FiniteNumber {
    fn from(value: SafeInteger) -> Self {
        Self(value.get() as f64)
    }
}

impl Serialize for FiniteNumber {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if self.0.fract() == 0.0 && self.0.abs() <= JS_SAFE_INTEGER_MAX as f64 {
            serializer.serialize_i64(self.0 as i64)
        } else {
            serializer.serialize_f64(self.0)
        }
    }
}

impl<'de> Deserialize<'de> for FiniteNumber {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct FiniteVisitor;
        impl de::Visitor<'_> for FiniteVisitor {
            type Value = FiniteNumber;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a finite JSON number")
            }

            fn visit_i64<E: de::Error>(self, value: i64) -> Result<Self::Value, E> {
                self.visit_f64(value as f64)
            }

            fn visit_u64<E: de::Error>(self, value: u64) -> Result<Self::Value, E> {
                self.visit_f64(value as f64)
            }

            fn visit_f64<E: de::Error>(self, value: f64) -> Result<Self::Value, E> {
                FiniteNumber::new(value).map_err(|_| E::custom("non-finite JSON number"))
            }
        }
        deserializer.deserialize_any(FiniteVisitor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finite_numbers_preserve_fractional_extreme_and_zero_values() {
        for value in [
            0.125,
            -0.125,
            f64::MIN_POSITIVE,
            f64::MAX,
            f64::from_bits(1),
        ] {
            assert_eq!(FiniteNumber::new(value).expect("finite").get(), value);
        }
        assert_eq!(FiniteNumber::new(-0.0), FiniteNumber::new(0.0));
        assert_eq!(FiniteNumber::new(-0.0).expect("zero").get().to_bits(), 0);
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(FiniteNumber::new(value).is_err());
        }
    }
}
