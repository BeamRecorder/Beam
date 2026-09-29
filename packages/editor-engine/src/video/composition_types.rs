//! A lane composition selects one media stream while preserving absolute time.
#[derive(Clone, Copy)]
pub(crate) struct CompositionSelection {
    pub lane: uuid::Uuid,
    pub stream: ges::TrackType,
}
