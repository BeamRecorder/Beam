//! Track and sequence processing share an absolute clock with no source-media origin.
use super::{ClipClock, Rate, TimeSpace};
use crate::{EditorError, Result};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SequenceClock;

impl ClipClock for SequenceClock {
    fn start_ms(&self) -> u64 {
        0
    }
    fn source_in_ms(&self) -> u64 {
        0
    }
    fn animation_offset_ms(&self) -> i64 {
        0
    }
    fn rate(&self) -> Rate {
        Rate::default()
    }
    fn validate_space(&self, space: TimeSpace) -> Result<()> {
        if space != TimeSpace::Sequence {
            return Err(EditorError::Invalid(
                "track and sequence effects require sequence time".into(),
            ));
        }
        Ok(())
    }
}
