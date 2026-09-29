//! Owned timing metadata lets mutable guards evaluate without borrowing a document.
use crate::timing::{ClipClock, Rate};

#[derive(Clone, Copy, Debug)]
pub(super) struct InstanceClock {
    pub start_ms: u64,
    pub source_in_ms: u64,
    pub animation_offset_ms: i64,
    pub rate: Rate,
}
impl<T: ClipClock + ?Sized> From<&T> for InstanceClock {
    fn from(clock: &T) -> Self {
        Self {
            start_ms: clock.start_ms(),
            source_in_ms: clock.source_in_ms(),
            animation_offset_ms: clock.animation_offset_ms(),
            rate: clock.rate(),
        }
    }
}
impl ClipClock for InstanceClock {
    fn start_ms(&self) -> u64 {
        self.start_ms
    }
    fn source_in_ms(&self) -> u64 {
        self.source_in_ms
    }
    fn animation_offset_ms(&self) -> i64 {
        self.animation_offset_ms
    }
    fn rate(&self) -> Rate {
        self.rate
    }
}
