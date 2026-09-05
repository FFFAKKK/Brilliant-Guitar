use brilliant_core_types::{StablePathSegmentV1, StablePathV1};
use serde_json::Value;

use crate::AssessmentFailureV1;

/// A local borrowing cursor over captured data. It owns no document state and
/// never converts semantically invalid IDs/numbers into store types. Required
/// structural reads fail explicitly instead of supplying silent defaults.
#[derive(Clone)]
pub(crate) struct CandidateNode<'a> {
    pub(crate) value: &'a Value,
    path: Vec<StablePathSegmentV1>,
}

impl<'a> CandidateNode<'a> {
    pub(crate) fn root(value: &'a Value) -> Self {
        Self {
            value,
            path: Vec::new(),
        }
    }

    pub(crate) fn field(&self, name: &'static str) -> Self {
        let mut path = self.path.clone();
        path.push(StablePathSegmentV1::Field(name.to_owned()));
        Self {
            value: self.value.get(name).unwrap_or(&Value::Null),
            path,
        }
    }

    pub(crate) fn optional(&self, name: &'static str) -> Option<Self> {
        self.value.get(name).map(|_| self.field(name))
    }

    pub(crate) fn items(self) -> Result<impl Iterator<Item = Self> + 'a, AssessmentFailureV1> {
        let values = self.value.as_array().ok_or_else(|| self.shape_failure())?;
        Ok(values.iter().enumerate().map(move |(index, value)| {
            let mut path = self.path.clone();
            path.push(StablePathSegmentV1::Index(index as u64));
            Self { value, path }
        }))
    }

    pub(crate) fn len(&self) -> Result<usize, AssessmentFailureV1> {
        self.value
            .as_array()
            .map(Vec::len)
            .ok_or_else(|| self.shape_failure())
    }

    pub(crate) fn string(&self) -> Result<&'a str, AssessmentFailureV1> {
        self.value.as_str().ok_or_else(|| self.shape_failure())
    }

    pub(crate) fn number(&self) -> Result<f64, AssessmentFailureV1> {
        self.value.as_f64().ok_or_else(|| self.shape_failure())
    }

    pub(crate) fn exact_fields(&self, fields: &[&str]) -> bool {
        self.value.as_object().is_some_and(|object| {
            object.len() == fields.len() && fields.iter().all(|key| object.contains_key(*key))
        })
    }

    pub(crate) fn path(&self) -> StablePathV1 {
        // Paths contain only the fixed score field names and bounded indices,
        // never extension payload keys or arbitrary user-provided field names.
        StablePathV1::new(self.path.clone()).expect("bounded score field path")
    }

    fn shape_failure(&self) -> AssessmentFailureV1 {
        AssessmentFailureV1::InvalidCandidateShape { path: self.path() }
    }
}
