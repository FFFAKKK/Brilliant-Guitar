use std::collections::HashMap;

use crate::{
    handles::{
        EventHandle, ExtensionHandle, MeasureHandle, NoteHandle, PartHandle, StaffHandle,
        VoiceHandle,
    },
    records::{PartMeasureContentRecord, PartMeasureKey},
};

#[derive(Debug, Default)]
pub(crate) struct ScoreTopology {
    pub(crate) measure_order: Vec<MeasureHandle>,
    pub(crate) part_order: Vec<PartHandle>,
    pub(crate) staff_order: HashMap<PartHandle, Vec<StaffHandle>>,
    pub(crate) content_order: HashMap<PartHandle, Vec<MeasureHandle>>,
    pub(crate) contents: HashMap<PartMeasureKey, PartMeasureContentRecord>,
    pub(crate) voice_order: HashMap<PartMeasureKey, Vec<VoiceHandle>>,
    pub(crate) event_order: HashMap<VoiceHandle, Vec<EventHandle>>,
    pub(crate) note_order: HashMap<EventHandle, Vec<NoteHandle>>,
    pub(crate) extension_order: Vec<ExtensionHandle>,
}
