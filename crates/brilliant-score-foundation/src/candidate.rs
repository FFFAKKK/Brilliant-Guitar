use brilliant_core_types::{
    JsString, LosslessJsonValue as Value, StablePathSegmentV1, StablePathV1,
};

use crate::AssessmentFailureV1;

/// Actual full-assessment work, independent of incremental scheduler counters.
/// Dependencies count cursor read/advance attempts (including failures), not
/// diagnostic path construction; rules count reached semantic check sites.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct AssessmentWorkV1 {
    pub rules_evaluated: u64,
    pub dependency_reads: u64,
}

#[derive(Clone)]
pub(crate) struct ObservedNode<'a, N> {
    pub(crate) node: N,
    pub(crate) work: &'a std::cell::Cell<AssessmentWorkV1>,
}

impl<N> ObservedNode<'_, N> {
    fn read(&self) {
        let mut work = self.work.get();
        work.dependency_reads = work.dependency_reads.saturating_add(1);
        self.work.set(work);
    }
}

pub(crate) struct ObservedItems<'a, N: AssessmentNodeV1> {
    items: N::Items,
    work: &'a std::cell::Cell<AssessmentWorkV1>,
}

impl<'a, N: AssessmentNodeV1> Iterator for ObservedItems<'a, N> {
    type Item = Result<ObservedNode<'a, N>, AssessmentFailureV1>;
    fn next(&mut self) -> Option<Self::Item> {
        let mut work = self.work.get();
        work.dependency_reads = work.dependency_reads.saturating_add(1);
        self.work.set(work);
        self.items.next().map(|result| {
            result.map(|node| ObservedNode {
                node,
                work: self.work,
            })
        })
    }
}

impl<'a, N: AssessmentNodeV1> AssessmentNodeV1 for ObservedNode<'a, N> {
    type Items = ObservedItems<'a, N>;
    fn field(&self, name: &'static str) -> Self {
        self.read();
        Self {
            node: self.node.field(name),
            work: self.work,
        }
    }
    fn optional(&self, name: &'static str) -> Result<Option<Self>, AssessmentFailureV1> {
        self.read();
        self.node.optional(name).map(|node| {
            node.map(|node| Self {
                node,
                work: self.work,
            })
        })
    }
    fn items(self) -> Result<Self::Items, AssessmentFailureV1> {
        self.read();
        Ok(ObservedItems {
            items: self.node.items()?,
            work: self.work,
        })
    }
    fn len(&self) -> Result<usize, AssessmentFailureV1> {
        self.read();
        self.node.len()
    }
    fn string(&self) -> Result<JsString, AssessmentFailureV1> {
        self.read();
        self.node.string()
    }
    fn number(&self) -> Result<f64, AssessmentFailureV1> {
        self.read();
        self.node.number()
    }
    fn exact_fields(&self, fields: &[&str]) -> Result<bool, AssessmentFailureV1> {
        self.read();
        self.node.exact_fields(fields)
    }
    fn is_array(&self) -> Result<bool, AssessmentFailureV1> {
        self.read();
        self.node.is_array()
    }
    fn path(&self) -> StablePathV1 {
        self.node.path()
    }
}

/// Internal cross-crate assessment cursor over an immutable candidate view.
/// Handles may borrow captured JSON or virtual score storage; scalar strings
/// retain their exact UTF-16 code units and numbers retain JavaScript semantics.
/// Missing required fields yield a null-shaped handle at the requested path;
/// `optional` distinguishes absence from an explicitly present null value.
/// Array iteration must preserve order and advance linearly without restarting
/// a parent traversal for each index. Implementations must not serialize or
/// materialize an entire document to supply this interface.
/// A failed `field` read may return a poisoned handle, but all subsequent
/// scalar, optional, array and shape reads must propagate that failure.
pub trait AssessmentNodeV1: Clone {
    type Items: Iterator<Item = Result<Self, AssessmentFailureV1>>;

    fn field(&self, name: &'static str) -> Self;
    fn optional(&self, name: &'static str) -> Result<Option<Self>, AssessmentFailureV1>;
    fn items(self) -> Result<Self::Items, AssessmentFailureV1>;
    fn len(&self) -> Result<usize, AssessmentFailureV1>;
    fn is_empty(&self) -> Result<bool, AssessmentFailureV1> {
        self.len().map(|length| length == 0)
    }
    fn string(&self) -> Result<JsString, AssessmentFailureV1>;
    fn number(&self) -> Result<f64, AssessmentFailureV1>;
    fn exact_fields(&self, fields: &[&str]) -> Result<bool, AssessmentFailureV1>;
    fn is_array(&self) -> Result<bool, AssessmentFailureV1>;
    fn path(&self) -> StablePathV1;
}

#[cfg(test)]
mod tests;

/// A local borrowing cursor over captured data. It owns no document state and
/// never converts semantically invalid IDs/numbers into store types. Required
/// structural reads fail explicitly instead of supplying silent defaults.
#[derive(Clone)]
pub(crate) struct CandidateNode<'a> {
    value: &'a Value,
    path: Vec<StablePathSegmentV1>,
}

impl<'a> CandidateNode<'a> {
    pub(crate) fn root(value: &'a Value) -> Self {
        Self {
            value,
            path: Vec::new(),
        }
    }

    fn field_value(&self, name: &str) -> Option<&'a Value> {
        let Value::Object(object) = self.value else {
            return None;
        };
        crate::with_json_field_key(name, |units| object.get(units))
    }

    fn shape_failure(&self) -> AssessmentFailureV1 {
        AssessmentFailureV1::InvalidCandidateShape { path: self.path() }
    }
}

pub(crate) struct CandidateItems<'a> {
    values: std::iter::Enumerate<std::slice::Iter<'a, Value>>,
    path: Vec<StablePathSegmentV1>,
}

impl<'a> Iterator for CandidateItems<'a> {
    type Item = Result<CandidateNode<'a>, AssessmentFailureV1>;

    fn next(&mut self) -> Option<Self::Item> {
        self.values.next().map(|(index, value)| {
            let mut path = self.path.clone();
            path.push(StablePathSegmentV1::Index(index as u64));
            Ok(CandidateNode { value, path })
        })
    }
}

impl<'a> AssessmentNodeV1 for CandidateNode<'a> {
    type Items = CandidateItems<'a>;

    fn field(&self, name: &'static str) -> Self {
        let mut path = self.path.clone();
        path.push(StablePathSegmentV1::Field(name.to_owned()));
        Self {
            value: self.field_value(name).unwrap_or(&Value::Null),
            path,
        }
    }

    fn optional(&self, name: &'static str) -> Result<Option<Self>, AssessmentFailureV1> {
        Ok(self.field_value(name).map(|_| self.field(name)))
    }

    fn items(self) -> Result<Self::Items, AssessmentFailureV1> {
        let Value::Array(values) = self.value else {
            return Err(self.shape_failure());
        };
        Ok(CandidateItems {
            values: values.iter().enumerate(),
            path: self.path,
        })
    }

    fn len(&self) -> Result<usize, AssessmentFailureV1> {
        match self.value {
            Value::Array(values) => Ok(values.len()),
            _ => Err(self.shape_failure()),
        }
    }

    fn string(&self) -> Result<JsString, AssessmentFailureV1> {
        match self.value {
            Value::String(value) => Ok(value.clone()),
            _ => Err(self.shape_failure()),
        }
    }

    fn number(&self) -> Result<f64, AssessmentFailureV1> {
        match self.value {
            Value::Number(value) => Ok(value.get()),
            _ => Err(self.shape_failure()),
        }
    }

    fn exact_fields(&self, fields: &[&str]) -> Result<bool, AssessmentFailureV1> {
        Ok(
            matches!(self.value, Value::Object(object) if object.len() == fields.len()
            && fields.iter().all(|key| self.field_value(key).is_some())),
        )
    }

    fn is_array(&self) -> Result<bool, AssessmentFailureV1> {
        Ok(matches!(self.value, Value::Array(_)))
    }

    fn path(&self) -> StablePathV1 {
        // Paths contain only the fixed score field names and bounded indices,
        // never extension payload keys or arbitrary user-provided field names.
        StablePathV1::new(self.path.clone()).expect("bounded score field path")
    }
}
