//! Native execution of the existing official Guitar contribution, outside Core and UI.
//! The generated profile and authentic TS callback corpus define conformance.
use super::domain_value::*;
use brilliant_core_types::{JsString, JsonValue};
use brilliant_score_foundation::{
    ExtensionOwnerV1, RhythmicContentV1, ScoreDocumentV1, ScoreNoteV1, decode_js_value_json,
};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

pub(super) const NAMESPACE: &str = "brilliant.instrument.guitar";
pub(super) const CONTRIBUTION: &str = "brilliant.instrument.guitar.editing.v1";
const EFFECT: &str = "brilliant.instrument.guitar.apply-mutation";
pub(super) fn supports_schema_version(version: i64) -> bool {
    [1, 2].contains(&version)
}
fn profile() -> &'static Value {
    static PROFILE: OnceLock<Value> = OnceLock::new();
    PROFILE.get_or_init(|| {
        decode_js_value_json(include_str!("official_domains/guitar-profile.json"))
            .expect("generated official profile")
    })
}
fn count() -> i64 {
    integer(field(profile(), "stringCount").unwrap(), 1, 32).unwrap()
}
fn semantic(reason: &str) -> Value {
    let code = format!("{NAMESPACE}.{reason}");
    literal(
        json!({"code":"command.contribution-semantic-invalid","issues":[{
            "issueVersion":1,"code":code,"severity":"error","messageKey":format!("module.{code}"),
            "source":{"kind":"module","moduleId":NAMESPACE,"contributionId":CONTRIBUTION}
        }]}),
    )
}
#[derive(Clone, Debug, PartialEq)]
struct Pitch {
    step: &'static str,
    alter: i64,
    octave: i64,
}
impl Pitch {
    fn decode(value: &Value) -> Option<Self> {
        if !exact(value, &["step", "alter", "octave"]) {
            return None;
        }
        let step = ["C", "D", "E", "F", "G", "A", "B"]
            .into_iter()
            .find(|s| tag(value, "step", s))?;
        Some(Self {
            step,
            alter: integer(field(value, "alter")?, -2, 2)?,
            octave: integer(field(value, "octave")?, 0, 8)?,
        })
    }
    fn encode(&self) -> Value {
        literal(json!({"step":self.step,"alter":self.alter,"octave":self.octave}))
    }
    fn matches(&self, note: &ScoreNoteV1) -> bool {
        self.encode() == literal(serde_json::to_value(&note.written_pitch).expect("pitch encoding"))
    }
}
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Position {
    pub note_id: JsString,
    pub string_number: i64,
    pub fret: i64,
}
#[derive(Clone, Debug, PartialEq)]
struct Technique {
    id: JsString,
    kind: &'static str,
    targets: Vec<JsString>,
    semitones: Option<i64>,
}
impl Technique {
    fn decode(value: &Value) -> Option<Self> {
        let id = entity(field(value, "id")?)?;
        let kind = ["hammer-on", "pull-off", "slide", "bend", "vibrato"]
            .into_iter()
            .find(|s| tag(value, "kind", s))?;
        let (targets, semitones) = match kind {
            "hammer-on" | "pull-off" | "slide" => {
                if !exact(value, &["id", "kind", "fromNoteId", "toNoteId"]) {
                    return None;
                }
                let a = entity(field(value, "fromNoteId")?)?;
                let b = entity(field(value, "toNoteId")?)?;
                if a == b {
                    return None;
                }
                (vec![a, b], None)
            }
            "bend" => {
                if !exact(value, &["id", "kind", "noteId", "semitones"]) {
                    return None;
                }
                (
                    vec![entity(field(value, "noteId")?)?],
                    Some(integer(field(value, "semitones")?, 1, 2)?),
                )
            }
            _ => {
                if !exact(value, &["id", "kind", "noteId"]) {
                    return None;
                }
                (vec![entity(field(value, "noteId")?)?], None)
            }
        };
        Some(Self {
            id,
            kind,
            targets,
            semitones,
        })
    }
    fn encode(&self) -> Value {
        let mut pairs = vec![
            ("id", JsonValue::String(self.id.clone())),
            ("kind", literal(json!(self.kind))),
        ];
        if self.targets.len() == 2 {
            pairs.extend([
                ("fromNoteId", JsonValue::String(self.targets[0].clone())),
                ("toNoteId", JsonValue::String(self.targets[1].clone())),
            ]);
        } else {
            pairs.push(("noteId", JsonValue::String(self.targets[0].clone())));
        }
        if let Some(n) = self.semitones {
            pairs.push(("semitones", literal(json!(n))));
        }
        JsonValue::Object(pairs.into_iter().map(|(k, v)| (k.into(), v)).collect())
    }
}
#[derive(Clone, Debug, PartialEq)]
pub(super) struct State {
    pub string_count: i64,
    pub fret_count: Option<i64>,
    pub capo_fret: i64,
    tuning: Vec<Pitch>,
    pub placements: Vec<Position>,
    techniques: Vec<Technique>,
}
fn decode_tuning(value: &Value) -> Option<Vec<Pitch>> {
    let rows = array(value)?;
    if rows.len() != count() as usize {
        return None;
    }
    rows.iter()
        .enumerate()
        .map(|(i, row)| {
            if !exact(row, &["stringNumber", "soundingPitch"])
                || integer(field(row, "stringNumber")?, 1, 32)? != i as i64 + 1
            {
                return None;
            }
            Pitch::decode(field(row, "soundingPitch")?)
        })
        .collect()
}
impl State {
    fn decode(value: &Value, schema_version: i64) -> Option<Self> {
        if !exact(
            value,
            &[
                "stringCount",
                "fretCount",
                "capoFret",
                "tuning",
                "placements",
                "techniques",
            ],
        ) {
            return None;
        }
        let string_count = integer(field(value, "stringCount")?, 1, 32)?;
        if string_count != count() {
            return None;
        }
        let physical = field(value, "fretCount")?;
        let fret_count = if schema_version == 2 && matches!(physical, JsonValue::Null) {
            None
        } else {
            Some(integer(physical, 1, if schema_version == 1 { 36 } else { 9_007_199_254_740_991 })?)
        };
        let capo_fret = integer(field(value, "capoFret")?, 0,
            if schema_version == 1 { fret_count? } else { 9_007_199_254_740_991 })?;
        let max_fret = if schema_version == 1 { fret_count? - capo_fret }
            else { 9_007_199_254_740_991 - capo_fret };
        let mut placements: Vec<Position> = vec![];
        for row in array(field(value, "placements")?)? {
            if !exact(row, &["noteId", "stringNumber", "fret"]) {
                return None;
            }
            let note_id = entity(field(row, "noteId")?)?;
            if placements.last().is_some_and(|p| p.note_id >= note_id) {
                return None;
            }
            placements.push(Position {
                note_id,
                string_number: integer(field(row, "stringNumber")?, 1, count())?,
                fret: integer(field(row, "fret")?, 0, max_fret)?,
            });
        }
        let mut techniques: Vec<Technique> = vec![];
        for row in array(field(value, "techniques")?)? {
            let technique = Technique::decode(row)?;
            if techniques.last().is_some_and(|t| t.id >= technique.id) {
                return None;
            }
            techniques.push(technique);
        }
        Some(Self {
            string_count,
            fret_count,
            capo_fret,
            tuning: decode_tuning(field(value, "tuning")?)?,
            placements,
            techniques,
        })
    }
    fn initial() -> Self {
        Self {
            string_count: count(),
            fret_count: match field(profile(), "fretCount").unwrap() {
                JsonValue::Null => None, value => Some(integer(value, 1, 9_007_199_254_740_991).unwrap()),
            },
            capo_fret: integer(field(profile(), "capoFret").unwrap(), 0, 9_007_199_254_740_991).unwrap(),
            tuning: decode_tuning(field(profile(), "tuning").unwrap()).unwrap(),
            placements: vec![],
            techniques: vec![],
        }
    }
    fn encode(&self) -> Value {
        object([
            ("stringCount", literal(json!(self.string_count))),
            ("fretCount", literal(json!(self.fret_count))),
            ("capoFret", literal(json!(self.capo_fret))),
            (
                "tuning",
                JsonValue::Array(
                    self.tuning
                        .iter()
                        .enumerate()
                        .map(|(i, p)| {
                            object([
                                ("stringNumber", literal(json!(i + 1))),
                                ("soundingPitch", p.encode()),
                            ])
                        })
                        .collect(),
                ),
            ),
            (
                "placements",
                JsonValue::Array(
                    self.placements
                        .iter()
                        .map(|p| {
                            object([
                                ("noteId", JsonValue::String(p.note_id.clone())),
                                ("stringNumber", literal(json!(p.string_number))),
                                ("fret", literal(json!(p.fret))),
                            ])
                        })
                        .collect(),
                ),
            ),
            (
                "techniques",
                JsonValue::Array(self.techniques.iter().map(Technique::encode).collect()),
            ),
        ])
    }
    fn written_pitch(&self, string_number: i64, fret: i64) -> Option<Pitch> {
        let pitch = self.tuning.get(usize::try_from(string_number - 1).ok()?)?;
        if fret < 0 || fret > 9_007_199_254_740_991 - self.capo_fret {
            return None;
        }
        let natural = match pitch.step {
            "C" => 0,
            "D" => 2,
            "E" => 4,
            "F" => 5,
            "G" => 7,
            "A" => 9,
            "B" => 11,
            _ => return None,
        };
        let offset = integer(field(profile(), "writtenPitchOffsetSemitones")?, -96, 96)?;
        let mut n = pitch.octave * 12 + natural + pitch.alter;
        for delta in [self.capo_fret, fret, offset] {
            n = n.checked_add(delta)?;
            if !(-9_007_199_254_740_991..=9_007_199_254_740_991).contains(&n) { return None; }
        }
        let (step, alter) = [
            ("C", 0),
            ("C", 1),
            ("D", 0),
            ("D", 1),
            ("E", 0),
            ("F", 0),
            ("F", 1),
            ("G", 0),
            ("G", 1),
            ("A", 0),
            ("A", 1),
            ("B", 0),
        ][n.rem_euclid(12) as usize];
        let octave = n.div_euclid(12);
        (0..=8).contains(&octave).then_some(Pitch {
            step,
            alter,
            octave,
        })
    }
    pub(super) fn has_techniques(&self) -> bool {
        !self.techniques.is_empty()
    }
}
pub(super) fn read_part(document: &ScoreDocumentV1, id: &JsString) -> Option<State> {
    let block = document.extensions.iter().find(|b| {
        b.namespace.eq_ascii(NAMESPACE)
            && matches!(&b.owner,ExtensionOwnerV1::Part{part_id} if part_id.as_js_string()==id)
    })?;
    if !supports_schema_version(block.schema_version.get()) {
        return None;
    }
    State::decode(&JsonValue::Object(block.payload.clone()), block.schema_version.get())
}
struct Located<'a> {
    note: &'a ScoreNoteV1,
    event: &'a JsString,
    order: usize,
}
fn notes<'a>(document: &'a ScoreDocumentV1, id: &JsString) -> BTreeMap<JsString, Located<'a>> {
    let mut result = BTreeMap::new();
    let mut order = 0;
    if let Some(part) = document.parts.iter().find(|p| p.id.as_js_string() == id) {
        for m in &part.measure_contents {
            for v in &m.voices {
                for e in &v.sequence.events {
                    if let RhythmicContentV1::Notes { notes } = &e.content {
                        for note in notes {
                            result.insert(
                                note.id.as_js_string().clone(),
                                Located {
                                    note,
                                    event: e.id.as_js_string(),
                                    order,
                                },
                            );
                        }
                    }
                    order += 1;
                }
            }
        }
    }
    result
}
fn matches_part(document: &ScoreDocumentV1, id: &JsString) -> bool {
    document
        .parts
        .iter()
        .find(|p| p.id.as_js_string() == id)
        .is_some_and(|p| {
            p.instrument.written_to_sounding.diatonic_steps.get() == -7
                && p.instrument.written_to_sounding.chromatic_semitones.get() == -12
        })
}
fn validate_state(
    document: &ScoreDocumentV1,
    part: &JsString,
    state: &State,
) -> CallbackResult<()> {
    if !matches_part(document, part) {
        return Err(semantic("unsupported-instrument"));
    }
    let located = notes(document, part);
    let placements: BTreeMap<_, _> = state.placements.iter().map(|p| (&p.note_id, p)).collect();
    let mut occupied = BTreeSet::new();
    for p in &state.placements {
        let note = located
            .get(&p.note_id)
            .ok_or_else(|| semantic("dangling-position"))?;
        if !state
            .written_pitch(p.string_number, p.fret)
            .is_some_and(|expected| expected.matches(note.note))
        {
            return Err(semantic("pitch-position-mismatch"));
        }
        if !occupied.insert((note.event, p.string_number)) {
            return Err(semantic("string-position-conflict"));
        }
    }
    for t in &state.techniques {
        for id in &t.targets {
            if !located.contains_key(id) {
                return Err(semantic("dangling-technique"));
            }
            if !placements.contains_key(id) {
                return Err(semantic("technique-position-required"));
            }
        }
        if t.targets.len() == 2 {
            let a = placements[&t.targets[0]];
            let b = placements[&t.targets[1]];
            if a.string_number != b.string_number {
                return Err(semantic("connection-string-mismatch"));
            }
            if located[&t.targets[0]].order >= located[&t.targets[1]].order {
                return Err(semantic("connection-order-invalid"));
            }
            if t.kind == "hammer-on" && a.fret >= b.fret {
                return Err(semantic("hammer-on-direction-invalid"));
            }
            if t.kind == "pull-off" && a.fret <= b.fret {
                return Err(semantic("pull-off-direction-invalid"));
            }
            if a.fret == b.fret {
                return Err(semantic("connection-position-invalid"));
            }
        }
    }
    let mut bends = BTreeSet::new();
    let mut vibratos = BTreeSet::new();
    let mut from = BTreeSet::new();
    let mut to = BTreeSet::new();
    for t in &state.techniques {
        let valid = match t.kind {
            "bend" => bends.insert(&t.targets[0]),
            "vibrato" => vibratos.insert(&t.targets[0]),
            _ => from.insert(&t.targets[0]) && to.insert(&t.targets[1]),
        };
        if !valid {
            return Err(semantic("technique-conflict"));
        }
    }
    Ok(())
}
pub(super) fn validate(document: &ScoreDocumentV1) -> CallbackResult<()> {
    for b in document
        .extensions
        .iter()
        .filter(|b| b.namespace.eq_ascii(NAMESPACE) && supports_schema_version(b.schema_version.get()))
    {
        let ExtensionOwnerV1::Part { part_id } = &b.owner else {
            return Err(semantic("wrong-owner"));
        };
        if !document.parts.iter().any(|p| &p.id == part_id) {
            return Err(semantic("wrong-owner"));
        }
        let state = State::decode(&JsonValue::Object(b.payload.clone()), b.schema_version.get())
            .ok_or_else(|| semantic("invalid-block"))?;
        validate_state(document, part_id.as_js_string(), &state)?;
    }
    Ok(())
}
pub(super) fn supported_block(
    document: &ScoreDocumentV1,
    b: &brilliant_score_foundation::ExtensionBlockV1,
) -> bool {
    if !b.namespace.eq_ascii(NAMESPACE) || !supports_schema_version(b.schema_version.get()) {
        return false;
    }
    let ExtensionOwnerV1::Part { part_id } = &b.owner else {
        return false;
    };
    read_part(document, part_id.as_js_string()).is_some_and(|s| {
        !s.has_techniques() && validate_state(document, part_id.as_js_string(), &s).is_ok()
    })
}
#[derive(Clone)]
enum Edit {
    Initialize,
    Tuning(Vec<Pitch>),
    Position(JsString, Option<(i64, i64)>),
    Technique(Technique),
    RemoveTechnique(JsString),
}
fn decode_edit(kind: &str, payload: &Value) -> Option<Edit> {
    match kind {
        "initialize" if exact(payload, &[]) => Some(Edit::Initialize),
        "set-tuning" if exact(payload, &["tuning"]) => {
            Some(Edit::Tuning(decode_tuning(field(payload, "tuning")?)?))
        }
        "set-position" if exact(payload, &["noteId", "position"]) => {
            let id = entity(field(payload, "noteId")?)?;
            let p = field(payload, "position")?;
            let position = if matches!(p, JsonValue::Null) {
                None
            } else {
                if !exact(p, &["stringNumber", "fret"]) {
                    return None;
                }
                Some((
                    integer(field(p, "stringNumber")?, 1, count())?,
                    integer(field(p, "fret")?, 0, 9_007_199_254_740_991)?,
                ))
            };
            Some(Edit::Position(id, position))
        }
        "set-technique" if exact(payload, &["technique"]) => Some(Edit::Technique(
            Technique::decode(field(payload, "technique")?)?,
        )),
        "remove-technique" if exact(payload, &["techniqueId"]) => Some(Edit::RemoveTechnique(
            entity(field(payload, "techniqueId")?)?,
        )),
        _ => None,
    }
}
fn mutation(part: &JsString, kind: &str, payload: &Value) -> Value {
    let JsonValue::Object(mut fields) = payload.clone() else {
        unreachable!()
    };
    fields.insert("kind".into(), literal(json!(kind)));
    fields.insert("partId".into(), JsonValue::String(part.clone()));
    JsonValue::Object(fields)
}
fn updated(mut state: State, edit: &Edit) -> State {
    match edit {
        Edit::Initialize => return State::initial(),
        Edit::Tuning(t) => state.tuning = t.clone(),
        Edit::Position(id, p) => {
            state.placements.retain(|p| &p.note_id != id);
            if let Some((s, f)) = p {
                state.placements.push(Position {
                    note_id: id.clone(),
                    string_number: *s,
                    fret: *f,
                });
            }
            state.placements.sort_by(|a, b| a.note_id.cmp(&b.note_id));
        }
        Edit::Technique(t) => {
            state.techniques.retain(|x| x.id != t.id);
            state.techniques.push(t.clone());
            state.techniques.sort_by(|a, b| a.id.cmp(&b.id));
        }
        Edit::RemoveTechnique(id) => state.techniques.retain(|t| &t.id != id),
    }
    state
}
pub(super) fn prepare(input: &Value, document: &ScoreDocumentV1) -> CallbackResult<Value> {
    let command = field(input, "command").ok_or_else(invalid)?;
    let target = field(command, "target").ok_or_else(invalid)?;
    if !exact(target, &["kind", "partId"]) || !tag(target, "kind", "part") {
        return Err(invalid());
    }
    let part = entity(field(target, "partId").ok_or_else(invalid)?).ok_or_else(invalid)?;
    let kind = [
        "initialize",
        "set-tuning",
        "set-position",
        "set-technique",
        "remove-technique",
    ]
    .into_iter()
    .find(|kind| tag(command, "commandId", &format!("{NAMESPACE}.{kind}")))
    .ok_or_else(invalid)?;
    let payload = field(command, "payload").ok_or_else(invalid)?;
    let edit = decode_edit(kind, payload).ok_or_else(invalid)?;
    if !document.parts.iter().any(|p| p.id.as_js_string() == &part) {
        return Err(literal(json!({"code":"command.target-not-found"})));
    }
    let before = read_part(document, &part);
    let owner = object([
        ("kind", literal(json!("part"))),
        ("partId", JsonValue::String(part.clone())),
    ]);
    let mut affected = vec![];
    let mut effects = vec![];
    let located = notes(document, &part);
    let mut pitch_effect = |id: &JsString, pitch: Pitch| {
        effects.push(object([
            ("requestVersion", literal(json!(1))),
            (
                "requestKind",
                literal(json!("core.note.replace-written-pitch")),
            ),
            (
                "target",
                object([
                    ("kind", literal(json!("note"))),
                    ("noteId", JsonValue::String(id.clone())),
                ]),
            ),
            ("writtenPitch", pitch.encode()),
        ]));
    };
    let no_op = match &edit {
        Edit::Initialize => {
            if !matches_part(document, &part) {
                return Err(semantic("unsupported-instrument"));
            }
            before.is_some()
        }
        _ => {
            let state = before.as_ref().ok_or_else(|| semantic("not-initialized"))?;
            match &edit {
                Edit::Tuning(t) => {
                    if state.tuning == *t {
                        true
                    } else {
                        let next = updated(state.clone(), &edit);
                        for p in &next.placements {
                            let pitch = next
                                .written_pitch(p.string_number, p.fret)
                                .ok_or_else(|| semantic("invalid-tuning"))?;
                            let note = located
                                .get(&p.note_id)
                                .ok_or_else(|| semantic("invalid-tuning"))?;
                            if !pitch.matches(note.note) {
                                pitch_effect(&p.note_id, pitch);
                                affected.push(object([
                                    ("kind", literal(json!("note"))),
                                    ("noteId", JsonValue::String(p.note_id.clone())),
                                ]));
                            }
                        }
                        false
                    }
                }
                Edit::Position(id, position) => {
                    let note = located.get(id).ok_or_else(|| semantic("missing-note"))?;
                    let pitch = if let Some((s, f)) = position {
                        if *f > 9_007_199_254_740_991 - state.capo_fret {
                            return Err(semantic("invalid-position"));
                        }
                        Some(
                            state
                                .written_pitch(*s, *f)
                                .ok_or_else(|| semantic("pitch-out-of-range"))?,
                        )
                    } else {
                        if state.techniques.iter().any(|t| t.targets.contains(id)) {
                            return Err(semantic("position-in-use"));
                        }
                        None
                    };
                    let current = state
                        .placements
                        .iter()
                        .find(|p| &p.note_id == id)
                        .map(|p| (p.string_number, p.fret));
                    if current == *position && pitch.as_ref().is_none_or(|p| p.matches(note.note)) {
                        true
                    } else {
                        if let Some(p) = pitch {
                            pitch_effect(id, p);
                        }
                        affected.push(object([
                            ("kind", literal(json!("note"))),
                            ("noteId", JsonValue::String(id.clone())),
                        ]));
                        false
                    }
                }
                Edit::Technique(t) => {
                    if state.techniques.iter().any(|current| current == t) {
                        true
                    } else {
                        validate_state(document, &part, &updated(state.clone(), &edit))?;
                        false
                    }
                }
                Edit::RemoveTechnique(id) => !state.techniques.iter().any(|t| &t.id == id),
                Edit::Initialize => unreachable!(),
            }
        }
    };
    if no_op {
        return Ok(literal(json!({"ok":true,"prepared":{"status":"no-op"}})));
    }
    effects.push(object([
        ("requestVersion", literal(json!(1))),
        ("requestKind", literal(json!("module.extension"))),
        ("effectKind", literal(json!(EFFECT))),
        ("namespace", literal(json!(NAMESPACE))),
        ("owner", owner.clone()),
        ("payload", mutation(&part, kind, payload)),
    ]));
    affected.push(owner);
    Ok(object([
        ("ok", JsonValue::Bool(true)),
        (
            "prepared",
            object([
                ("status", literal(json!("changed"))),
                ("effectRequests", JsonValue::Array(effects)),
                ("affected", JsonValue::Array(affected)),
            ]),
        ),
    ]))
}
pub(super) fn transform(input: &Value, document: &ScoreDocumentV1) -> CallbackResult<Value> {
    if !tag(input, "contributionId", CONTRIBUTION) {
        return Err(internal());
    }
    let effect = field(input, "effect").ok_or_else(internal)?;
    if !tag(effect, "effectKind", EFFECT) || !tag(effect, "namespace", NAMESPACE) {
        return Err(internal());
    }
    let value = field(effect, "payload").ok_or_else(internal)?;
    let JsonValue::Object(mut fields) = value.clone() else {
        return Err(internal());
    };
    let part = entity(field(value, "partId").ok_or_else(internal)?).ok_or_else(internal)?;
    let kind = field(value, "kind")
        .and_then(string)
        .and_then(|s| s.to_utf8().ok())
        .ok_or_else(internal)?;
    fields.remove(&JsString::from("partId"));
    fields.remove(&JsString::from("kind"));
    let edit = decode_edit(&kind, &JsonValue::Object(fields)).ok_or_else(internal)?;
    let owner = field(effect, "owner").ok_or_else(internal)?;
    if !tag(owner, "kind", "part") || field(owner, "partId").and_then(string) != Some(&part) {
        return Err(semantic("wrong-owner"));
    }
    let state = if matches!(edit, Edit::Initialize) {
        if read_part(document, &part).is_some() {
            return Err(semantic("already-initialized"));
        }
        State::initial()
    } else {
        let current = read_part(document, &part).ok_or_else(|| semantic("not-initialized"))?;
        updated(current, &edit)
    };
    Ok(object([
        ("ok", JsonValue::Bool(true)),
        (
            "transformed",
            object([
                ("status", literal(json!("replace"))),
                ("schemaVersion", literal(json!(2))),
                ("payload", state.encode()),
            ]),
        ),
    ]))
}
