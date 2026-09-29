//! A transition owns a clock beginning at its first borrowed source handle.
use crate::timing::{ClipClock, Rate};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TransitionClock {
    pub start_ms: u64,
}

impl ClipClock for TransitionClock {
    fn start_ms(&self) -> u64 {
        self.start_ms
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
}
