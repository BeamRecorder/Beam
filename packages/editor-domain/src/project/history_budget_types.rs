//! History has a byte budget independently from the size of the accepted montage.
pub const HISTORY_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Clone, Copy)]
pub(super) enum Stack {
    SequenceUndo(usize),
    SequenceRedo(usize),
    ProjectUndo,
    ProjectRedo,
}
