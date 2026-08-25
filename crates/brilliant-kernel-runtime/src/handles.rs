use slotmap::new_key_type;

new_key_type! {
    pub(crate) struct MeasureHandle;
    pub(crate) struct PartHandle;
    pub(crate) struct StaffHandle;
    pub(crate) struct VoiceHandle;
    pub(crate) struct EventHandle;
    pub(crate) struct NoteHandle;
    pub(crate) struct ExtensionHandle;
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum RuntimeEntityRef {
    Document,
    Measure(MeasureHandle),
    Part(PartHandle),
    Staff(StaffHandle),
    Voice(VoiceHandle),
    Event(EventHandle),
    Note(NoteHandle),
}
