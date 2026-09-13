//! Candidate-bound Core data reads. No committed-session lookup or semantic
//! validation is run here: the source is the exact enclosing callback input.
use std::{
    cell::OnceCell,
    collections::HashMap,
    io::{self, Write},
};

use brilliant_core_types::{JsString, JsonValue};
use brilliant_extension_protocol::{ContributionCoreReadV2, ContributionReadFailureV2 as Failure};
use brilliant_score_foundation::LosslessEncode;

use super::super::wire::{Value, array, decode, exact, field, integer, object, string, tag, text};
use super::StableEntityAddressV1;

mod budget;
pub(super) use budget::OperationScope;

const MAX_QUERY_BYTES: usize = 4 * 1024;
const MAX_QUERIES: usize = 128;
const MAX_REPLY_BYTES: usize = 1024 * 1024;
const MAX_TOTAL_REPLY_BYTES: usize = 8 * 1024 * 1024;
const MAX_INDEX_ENTITIES: usize = 131_072;
const MAX_INDEX_VISITS: usize = MAX_INDEX_ENTITIES * 2;
type Result<T> = std::result::Result<T, Failure>;

struct Entry<'a> {
    entity: &'a Value,
    ownership: Value,
}

struct Index<'a> {
    entries: HashMap<(JsString, JsString), Entry<'a>>,
    visits: usize,
    budget: budget::Account,
}

pub(super) struct CoreReads<'a> {
    document: Option<&'a Value>,
    version: Option<&'a Value>,
    index: Option<Index<'a>>,
    calls: usize,
    remaining_bytes: usize,
    failed: bool,
    budget: budget::Account,
    lazy: Option<LazySource<'a>>,
}

struct LazySource<'a> {
    cache: &'a OnceCell<Value>,
    load: &'a mut dyn FnMut() -> Result<Value>,
}

impl<'a> CoreReads<'a> {
    pub(super) fn new(request: &'a Value) -> Self {
        Self::from_document(
            field(request, "document").ok(),
            field(request, "documentVersion").ok(),
        )
    }

    pub(super) fn from_document(document: Option<&'a Value>, version: Option<&'a Value>) -> Self {
        Self {
            document,
            version,
            index: None,
            calls: 0,
            remaining_bytes: MAX_TOTAL_REPLY_BYTES,
            failed: false,
            budget: budget::current(),
            lazy: None,
        }
    }

    /// Metadata uses the small scoped context. Every object read loads the
    /// actual complete candidate and retains the existing global index checks.
    pub(super) fn lazy(
        context: &'a Value,
        cache: &'a OnceCell<Value>,
        load: &'a mut dyn FnMut() -> Result<Value>,
    ) -> Self {
        let mut result = Self::new(context);
        result.lazy = Some(LazySource { cache, load });
        result
    }

    fn full_document(&mut self) -> Result<&'a Value> {
        let Some(lazy) = &mut self.lazy else {
            return self.document.ok_or(Failure::Unavailable);
        };
        if lazy.cache.get().is_none() {
            lazy.cache
                .set((lazy.load)()?)
                .map_err(|_| Failure::InvalidSource)?;
        }
        lazy.cache.get().ok_or(Failure::Unavailable)
    }

    pub(super) fn failed(&self) -> bool {
        self.failed || self.budget.borrow().failed()
    }

    fn read(&mut self, input: &[u8]) -> Result<Vec<u8>> {
        if self.calls >= MAX_QUERIES || input.len() > MAX_QUERY_BYTES {
            return Err(Failure::ResourceLimit);
        }
        self.calls += 1;
        self.budget.borrow_mut().query()?;
        let query = decode(input).map_err(|_| Failure::InvalidRequest)?;
        if field(&query, "readVersion").ok().and_then(integer) != Some(2) {
            return Err(Failure::InvalidRequest);
        }
        let document = self.document.ok_or(Failure::Unavailable)?;
        let id = source_field(document, "id")?;
        let selection = if tag(&query, "selectorId", "core.selector.score-metadata")
            && exact(&query, &["readVersion", "selectorId"])
        {
            Selection::Value(source_field(document, "metadata")?)
        } else if exact(&query, &["readVersion", "selectorId", "address"])
            && (tag(&query, "selectorId", "core.selector.score-entity")
                || tag(&query, "selectorId", "core.selector.score-entity-ownership"))
        {
            let address = field(&query, "address").map_err(|_| Failure::InvalidRequest)?;
            let (_, _, stable_address) =
                super::decode_address(address).map_err(|_| Failure::InvalidRequest)?;
            let stable_id = match &stable_address {
                StableEntityAddressV1::Document { document_id: id }
                | StableEntityAddressV1::Measure { measure_id: id }
                | StableEntityAddressV1::Part { part_id: id }
                | StableEntityAddressV1::Staff { staff_id: id }
                | StableEntityAddressV1::Voice { voice_id: id }
                | StableEntityAddressV1::Event { event_id: id }
                | StableEntityAddressV1::Note { note_id: id } => id,
            };
            let kind = field(address, "kind")
                .and_then(string)
                .map_err(|_| Failure::InvalidRequest)?;
            if self.index.is_none() {
                let full = self.full_document()?;
                self.index = Some(Index::build(full, self.budget.clone())?);
            }
            let entry = self
                .index
                .as_ref()
                .unwrap()
                .entries
                .get(&(kind.clone(), stable_id.as_js_string().clone()));
            match entry {
                None => Selection::Missing,
                Some(entry)
                    if tag(&query, "selectorId", "core.selector.score-entity-ownership") =>
                {
                    Selection::Value(&entry.ownership)
                }
                Some(entry) => Selection::Entity {
                    kind,
                    entity: entry.entity,
                    core_only: kind.eq_ascii("document"),
                },
            }
        } else {
            return Err(Failure::InvalidRequest);
        };
        let mut output = LimitedOutput {
            bytes: Vec::new(),
            limit: self
                .remaining_bytes
                .min(MAX_REPLY_BYTES)
                .min(self.budget.borrow().remaining_reply_bytes()),
        };
        let encode = || -> io::Result<()> {
            output.write_all(br#"{"readVersion":2,"documentId":"#)?;
            write_json(id, &mut output)?;
            output.write_all(br#","documentVersion":"#)?;
            write_json(self.version.unwrap_or(&JsonValue::Null), &mut output)?;
            output.write_all(br#","result":"#)?;
            selection.write(&mut output)?;
            output.write_all(b"}")
        };
        let mut encode = encode;
        encode().map_err(|_| Failure::ResourceLimit)?;
        self.remaining_bytes -= output.bytes.len();
        self.budget.borrow_mut().charge_reply(output.bytes.len())?;
        Ok(output.bytes)
    }
}

impl ContributionCoreReadV2 for CoreReads<'_> {
    fn read_core(&mut self, request: &[u8]) -> Result<Vec<u8>> {
        if self.failed() {
            return Err(Failure::ResourceLimit);
        }
        // Keep the failure sticky across an error or unwind. The runtime checks
        // this independently even if an executor catches it and returns success.
        self.failed = true;
        let mut attempt = ReadAttempt(self.budget.clone(), true);
        let result = self.read(request)?;
        self.failed = false;
        attempt.1 = false;
        Ok(result)
    }
}

struct ReadAttempt(budget::Account, bool);
impl Drop for ReadAttempt {
    fn drop(&mut self) {
        if self.1 {
            self.0.borrow_mut().poison();
        }
    }
}

struct LimitedOutput {
    bytes: Vec<u8>,
    limit: usize,
}
impl Write for LimitedOutput {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.limit - self.bytes.len() {
            return Err(io::Error::other("scoped read output limit"));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

enum Selection<'a> {
    Missing,
    Value(&'a Value),
    Entity {
        kind: &'a JsString,
        entity: &'a Value,
        core_only: bool,
    },
}
fn write_json(value: &impl LosslessEncode, output: &mut impl Write) -> io::Result<()> {
    value
        .write_lossless(output)
        .map_err(|_| io::Error::other("scoped read encoding failed"))
}
impl Selection<'_> {
    fn write(&self, output: &mut impl Write) -> io::Result<()> {
        if matches!(self, Self::Missing) {
            return output.write_all(br#"{"ok":false,"failure":{"code":"read.entity-not-found"}}"#);
        }
        output.write_all(br#"{"ok":true,"value":"#)?;
        match self {
            Self::Missing => unreachable!(),
            Self::Value(value) => write_json(*value, output)?,
            Self::Entity {
                kind,
                entity,
                core_only,
            } => {
                output.write_all(br#"{"kind":"#)?;
                write_json(*kind, output)?;
                output.write_all(br#","value":"#)?;
                if *core_only {
                    // Full Core access is explicit; extensions never enter this
                    // capability, even through a document selector.
                    output.write_all(b"{")?;
                    for (index, key) in [
                        "schemaVersion",
                        "id",
                        "metadata",
                        "measureDefinitions",
                        "parts",
                    ]
                    .iter()
                    .enumerate()
                    {
                        if index != 0 {
                            output.write_all(b",")?;
                        }
                        write_json(&JsString::from(*key), output)?;
                        output.write_all(b":")?;
                        write_json(
                            field(entity, key)
                                .map_err(|_| io::Error::other("invalid Core source"))?,
                            output,
                        )?;
                    }
                    output.write_all(b"}")?;
                } else {
                    write_json(*entity, output)?;
                }
                output.write_all(b"}")?;
            }
        }
        output.write_all(b"}")
    }
}

fn source_field<'a>(value: &'a Value, key: &str) -> Result<&'a Value> {
    field(value, key).map_err(|_| Failure::InvalidSource)
}
fn source_array<'a>(value: &'a Value, key: &str) -> Result<&'a [Value]> {
    array(source_field(value, key)?).map_err(|_| Failure::InvalidSource)
}

impl<'a> Index<'a> {
    fn visit(&mut self) -> Result<()> {
        self.budget.borrow_mut().visit()?;
        self.visits += 1;
        if self.visits > MAX_INDEX_VISITS {
            Err(Failure::ResourceLimit)
        } else {
            Ok(())
        }
    }
    fn add(&mut self, kind: &str, entity: &'a Value, owner: Value) -> Result<()> {
        self.visit()?;
        if self.entries.len() >= MAX_INDEX_ENTITIES {
            return Err(Failure::ResourceLimit);
        }
        let id = string(source_field(entity, "id")?)
            .map_err(|_| Failure::InvalidSource)?
            .clone();
        if self
            .entries
            .insert(
                (kind.into(), id),
                Entry {
                    entity,
                    ownership: owner,
                },
            )
            .is_some()
        {
            return Err(Failure::InvalidSource);
        }
        Ok(())
    }
    fn build(document: &'a Value, budget: budget::Account) -> Result<Self> {
        let mut index = Self {
            entries: HashMap::new(),
            visits: 0,
            budget,
        };
        let id = source_field(document, "id")?;
        let owner = |kind: &str, fields: &[(&str, &Value)]| {
            let JsonValue::Object(mut map) =
                object([("entityKind", text(kind)), ("documentId", id.clone())])
            else {
                unreachable!()
            };
            for (key, value) in fields {
                map.insert((*key).into(), (*value).clone());
            }
            JsonValue::Object(map)
        };
        index.add("document", document, owner("document", &[]))?;
        for measure in source_array(document, "measureDefinitions")? {
            index.add("measure", measure, owner("measure", &[]))?;
        }
        for part in source_array(document, "parts")? {
            let part_id = source_field(part, "id")?;
            index.add("part", part, owner("part", &[]))?;
            for staff in source_array(part, "staves")? {
                index.add("staff", staff, owner("staff", &[("partId", part_id)]))?;
            }
            for content in source_array(part, "measureContents")? {
                index.visit()?;
                let measure_id = source_field(content, "measureId")?;
                for voice in source_array(content, "voices")? {
                    let voice_id = source_field(voice, "id")?;
                    index.add(
                        "voice",
                        voice,
                        owner("voice", &[("partId", part_id), ("measureId", measure_id)]),
                    )?;
                    for event in source_array(source_field(voice, "sequence")?, "events")? {
                        let event_id = source_field(event, "id")?;
                        index.add(
                            "event",
                            event,
                            owner(
                                "event",
                                &[
                                    ("partId", part_id),
                                    ("measureId", measure_id),
                                    ("voiceId", voice_id),
                                ],
                            ),
                        )?;
                        let content = source_field(event, "content")?;
                        if tag(content, "kind", "notes") {
                            for note in source_array(content, "notes")? {
                                index.add(
                                    "note",
                                    note,
                                    owner(
                                        "note",
                                        &[
                                            ("partId", part_id),
                                            ("measureId", measure_id),
                                            ("voiceId", voice_id),
                                            ("eventId", event_id),
                                        ],
                                    ),
                                )?;
                            }
                        }
                    }
                }
            }
        }
        Ok(index)
    }
}

#[cfg(test)]
mod tests;
