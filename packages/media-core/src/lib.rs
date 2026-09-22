//! Shared capture timing and frame delivery contracts.

mod clock;
mod frame;
mod gate;
mod preview;

pub use clock::{
    AudioSampleClock, ClockError, MonotonicClock, NativeTimestampMapper, SessionClock,
};
pub use frame::{AudioPacket, VideoFrame};
pub use gate::{GateError, StartGate};
pub use preview::LatestFrame;
