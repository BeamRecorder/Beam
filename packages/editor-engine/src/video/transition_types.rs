//! The logical clip is unchanged; native composition borrows validated source handles.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RenderWindow {
    pub start_ms: u64,
    pub source_in_ms: u64,
    pub duration_ms: u64,
}
