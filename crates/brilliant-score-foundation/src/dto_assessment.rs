//! Borrow typed score data for the shared assessment rules. This is a view,
//! not a second document owner or an alternative semantic validator.
use brilliant_core_types::JsonObject;
use std::io::{self, Write};

use crate::{AssessmentFailureV1, AssessmentNodeV1, LosslessEncode, ScoreDocumentV1};
use brilliant_core_types::{
    FiniteNumber, JSON_DEPTH_LIMIT, JSON_PROPERTY_LIMIT, JsString, JsonValue, SafeInteger,
    StableId, StablePathSegmentV1, StablePathV1,
};
#[cfg(test)]
mod tests;

pub(crate) trait View {
    fn field(&self, _: &str) -> Option<&dyn View> {
        None
    }
    fn fields(&self) -> Option<usize> {
        None
    }
    fn len(&self) -> Option<usize> {
        None
    }
    fn item(&self, _: usize) -> Option<&dyn View> {
        None
    }
    fn string(&self) -> Option<JsString> {
        None
    }
    fn number(&self) -> Option<f64> {
        None
    }
    fn children(&self, _: &mut dyn FnMut(&dyn View) -> bool) -> bool {
        true
    }
}

impl View for JsString {
    fn string(&self) -> Option<JsString> {
        Some(self.clone())
    }
}
impl View for StableId {
    fn string(&self) -> Option<JsString> {
        Some(self.as_js_string().clone())
    }
}
impl View for String {
    fn string(&self) -> Option<JsString> {
        Some(self.as_str().into())
    }
}
impl View for &str {
    fn string(&self) -> Option<JsString> {
        Some((*self).into())
    }
}
impl View for SafeInteger {
    fn number(&self) -> Option<f64> {
        Some(self.get() as f64)
    }
}
impl View for FiniteNumber {
    fn number(&self) -> Option<f64> {
        Some(self.get())
    }
}
impl<T: View> View for Vec<T> {
    fn len(&self) -> Option<usize> {
        Some(Vec::len(self))
    }
    fn item(&self, index: usize) -> Option<&dyn View> {
        self.get(index).map(|v| v as &dyn View)
    }
    fn children(&self, visit: &mut dyn FnMut(&dyn View) -> bool) -> bool {
        self.iter().all(|v| visit(v))
    }
}
impl<T: View + Ord> View for JsonObject<T, JsonValue<T>> {
    fn field(&self, name: &str) -> Option<&dyn View> {
        let name = JsString::from(name);
        self.iter().find_map(|(key, value)| {
            (key.string().as_ref() == Some(&name)).then_some(value as &dyn View)
        })
    }
    fn fields(&self) -> Option<usize> {
        Some(JsonObject::len(self))
    }
    fn children(&self, visit: &mut dyn FnMut(&dyn View) -> bool) -> bool {
        self.values().all(|v| visit(v))
    }
}
impl<T: View + Ord> View for JsonValue<T> {
    fn field(&self, name: &str) -> Option<&dyn View> {
        if let Self::Object(fields) = self {
            fields.field(name)
        } else {
            None
        }
    }
    fn fields(&self) -> Option<usize> {
        if let Self::Object(fields) = self {
            Some(fields.len())
        } else {
            None
        }
    }
    fn len(&self) -> Option<usize> {
        if let Self::Array(values) = self {
            Some(values.len())
        } else {
            None
        }
    }
    fn item(&self, index: usize) -> Option<&dyn View> {
        if let Self::Array(values) = self {
            values.get(index).map(|v| v as &dyn View)
        } else {
            None
        }
    }
    fn string(&self) -> Option<JsString> {
        if let Self::String(value) = self {
            value.string()
        } else {
            None
        }
    }
    fn number(&self) -> Option<f64> {
        if let Self::Number(value) = self {
            Some(value.get())
        } else {
            None
        }
    }
    fn children(&self, visit: &mut dyn FnMut(&dyn View) -> bool) -> bool {
        match self {
            Self::Object(fields) => fields.values().all(|v| visit(v)),
            Self::Array(values) => values.iter().all(|v| visit(v)),
            _ => true,
        }
    }
}

/// Borrow a strongly typed document without encoding or capturing its tree.
/// Callers remain responsible for input/candidate limits before assessment.
#[derive(Clone)]
pub struct DocumentAssessmentNodeV1<'a> {
    value: Option<&'a dyn View>,
    path: Vec<StablePathSegmentV1>,
}
impl<'a> DocumentAssessmentNodeV1<'a> {
    pub fn new(document: &'a ScoreDocumentV1) -> Self {
        Self {
            value: Some(document),
            path: Vec::new(),
        }
    }
    fn failure(&self) -> AssessmentFailureV1 {
        AssessmentFailureV1::InvalidCandidateShape { path: self.path() }
    }
}
pub struct DocumentAssessmentItemsV1<'a> {
    parent: DocumentAssessmentNodeV1<'a>,
    index: usize,
    len: usize,
}
impl<'a> Iterator for DocumentAssessmentItemsV1<'a> {
    type Item = Result<DocumentAssessmentNodeV1<'a>, AssessmentFailureV1>;
    fn next(&mut self) -> Option<Self::Item> {
        if self.index == self.len {
            return None;
        }
        let mut path = self.parent.path.clone();
        path.push(StablePathSegmentV1::Index(self.index as u64));
        let value = self.parent.value.and_then(|value| value.item(self.index));
        self.index += 1;
        Some(Ok(DocumentAssessmentNodeV1 { value, path }))
    }
}
impl<'a> AssessmentNodeV1 for DocumentAssessmentNodeV1<'a> {
    type Items = DocumentAssessmentItemsV1<'a>;
    fn field(&self, name: &'static str) -> Self {
        let mut path = self.path.clone();
        path.push(StablePathSegmentV1::Field(name.to_owned()));
        Self {
            value: self.value.and_then(|value| value.field(name)),
            path,
        }
    }
    fn optional(&self, name: &'static str) -> Result<Option<Self>, AssessmentFailureV1> {
        let value = self.value.ok_or_else(|| self.failure())?;
        value.fields().ok_or_else(|| self.failure())?;
        Ok(value.field(name).map(|_| self.field(name)))
    }
    fn items(self) -> Result<Self::Items, AssessmentFailureV1> {
        let len = self.len()?;
        Ok(DocumentAssessmentItemsV1 {
            parent: self,
            index: 0,
            len,
        })
    }
    fn len(&self) -> Result<usize, AssessmentFailureV1> {
        self.value.and_then(View::len).ok_or_else(|| self.failure())
    }
    fn string(&self) -> Result<JsString, AssessmentFailureV1> {
        self.value
            .and_then(View::string)
            .ok_or_else(|| self.failure())
    }
    fn number(&self) -> Result<f64, AssessmentFailureV1> {
        self.value
            .and_then(View::number)
            .ok_or_else(|| self.failure())
    }
    fn exact_fields(&self, fields: &[&str]) -> Result<bool, AssessmentFailureV1> {
        let value = self.value.ok_or_else(|| self.failure())?;
        Ok(value.fields() == Some(fields.len())
            && fields.iter().all(|name| value.field(name).is_some()))
    }
    fn is_array(&self) -> Result<bool, AssessmentFailureV1> {
        Ok(self.value.ok_or_else(|| self.failure())?.len().is_some())
    }
    fn path(&self) -> StablePathV1 {
        StablePathV1::new(self.path.clone()).expect("bounded score field path")
    }
}

/// Preserve the previous JSON capture envelope without allocating JSON bytes
/// or a captured tree. Typed structure and opaque values share the same limits.
#[derive(Debug, Eq, PartialEq)]
pub enum DocumentCaptureFailureV1 {
    Bytes,
    Invalid,
}

pub fn check_document_capture_limits(
    document: &ScoreDocumentV1,
    byte_limit: usize,
) -> Result<(), DocumentCaptureFailureV1> {
    struct Counter {
        written: usize,
    }
    impl Write for Counter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.written = self.written.saturating_add(bytes.len());
            Ok(bytes.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    fn within(value: &dyn View, depth: usize, count: &mut usize) -> bool {
        if depth > JSON_DEPTH_LIMIT || *count >= JSON_PROPERTY_LIMIT {
            return false;
        }
        *count += 1;
        value.children(&mut |child| within(child, depth + 1, count))
    }
    let mut counter = Counter { written: 0 };
    document
        .write_lossless(&mut counter)
        .map_err(|_| DocumentCaptureFailureV1::Invalid)?;
    if counter.written > byte_limit {
        return Err(DocumentCaptureFailureV1::Bytes);
    }
    if !within(document, 1, &mut 0) {
        return Err(DocumentCaptureFailureV1::Invalid);
    }
    Ok(())
}
