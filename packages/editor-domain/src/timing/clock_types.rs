//! Timing reads only clock metadata, without loading an effect payload.
use super::{Rate, TimeSpace};
use crate::{
    Clip,
    collections::{ItemMut, PersistentItem, headers::ClipHeader},
};
use std::sync::Arc;

pub trait ClipClock {
    fn start_ms(&self) -> u64;
    fn source_in_ms(&self) -> u64;
    fn animation_offset_ms(&self) -> i64;
    fn rate(&self) -> Rate;
    fn validate_space(&self, _space: TimeSpace) -> crate::Result<()> {
        Ok(())
    }
}

macro_rules! metadata_clock {
    ($kind:ty) => {
        impl ClipClock for $kind {
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
    };
}
metadata_clock!(Clip);
metadata_clock!(ClipHeader);

macro_rules! borrowed_clock {
    ($kind:ty) => {
        impl<T: ClipClock + ?Sized> ClipClock for $kind {
            fn start_ms(&self) -> u64 {
                (**self).start_ms()
            }
            fn source_in_ms(&self) -> u64 {
                (**self).source_in_ms()
            }
            fn animation_offset_ms(&self) -> i64 {
                (**self).animation_offset_ms()
            }
            fn rate(&self) -> Rate {
                (**self).rate()
            }
            fn validate_space(&self, space: TimeSpace) -> crate::Result<()> {
                (**self).validate_space(space)
            }
        }
    };
}
borrowed_clock!(&T);
borrowed_clock!(&mut T);
borrowed_clock!(Arc<T>);

impl<T: PersistentItem + ClipClock> ClipClock for ItemMut<'_, T> {
    fn start_ms(&self) -> u64 {
        (**self).start_ms()
    }
    fn source_in_ms(&self) -> u64 {
        (**self).source_in_ms()
    }
    fn animation_offset_ms(&self) -> i64 {
        (**self).animation_offset_ms()
    }
    fn rate(&self) -> Rate {
        (**self).rate()
    }
    fn validate_space(&self, space: TimeSpace) -> crate::Result<()> {
        (**self).validate_space(space)
    }
}
