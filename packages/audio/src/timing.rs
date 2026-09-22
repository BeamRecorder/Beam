use beam_media_core::{AudioSampleClock, ClockError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioAnchor {
    pub native_capture_ns: u64,
    pub native_callback_ns: u64,
    pub session_ns: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PacketTiming {
    pub first_sample: u64,
    pub start_ns: u64,
    pub end_ns: u64,
    pub native_capture_ns: u64,
    pub new_anchor: Option<AudioAnchor>,
    pub clock_discontinuity: bool,
    pub native_timestamp_usable: bool,
}

pub struct AudioTimeline {
    sample_rate: u32,
    clock: Option<AudioSampleClock>,
    next_sample: u64,
    last_native_capture_ns: Option<u64>,
    last_native_callback_ns: Option<u64>,
    native_clock_discontinuous: bool,
}

// Compare two native clocks; ordinary callback delay can vary, but a full
// second of capture-only progress indicates a reset rather than clock drift.
const MAX_NATIVE_CLOCK_LEAP_NS: u64 = 1_000_000_000;

impl AudioTimeline {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            clock: None,
            next_sample: 0,
            last_native_capture_ns: None,
            last_native_callback_ns: None,
            native_clock_discontinuous: false,
        }
    }

    pub fn packet(
        &mut self,
        native_capture_ns: u64,
        native_callback_ns: u64,
        session_callback_ns: u64,
        frames: u32,
    ) -> Result<PacketTiming, ClockError> {
        let regressed = self
            .last_native_capture_ns
            .is_some_and(|previous| native_capture_ns < previous)
            || self
                .last_native_callback_ns
                .is_some_and(|previous| native_callback_ns < previous);
        let leapt = self
            .last_native_capture_ns
            .zip(self.last_native_callback_ns)
            .is_some_and(|(capture, callback)| {
                native_capture_ns.saturating_sub(capture)
                    > native_callback_ns
                        .saturating_sub(callback)
                        .saturating_add(MAX_NATIVE_CLOCK_LEAP_NS)
            });
        let clock_discontinuity = !self.native_clock_discontinuous
            && (regressed || leapt || native_capture_ns > native_callback_ns);
        if clock_discontinuity {
            self.native_clock_discontinuous = true;
        }
        self.last_native_capture_ns = Some(native_capture_ns);
        self.last_native_callback_ns = Some(native_callback_ns);
        let new_anchor = if self.clock.is_none() {
            let capture_latency = native_callback_ns.saturating_sub(native_capture_ns);
            let session_ns = session_callback_ns.saturating_sub(capture_latency);
            self.clock = Some(AudioSampleClock::new(session_ns, self.sample_rate)?);
            Some(AudioAnchor {
                native_capture_ns,
                native_callback_ns,
                session_ns,
            })
        } else {
            None
        };
        let clock = self.clock.as_mut().ok_or(ClockError::InvalidRate)?;
        let first_sample = self.next_sample;
        let (start_ns, end_ns) = clock.advance(u64::from(frames))?;
        self.next_sample = self
            .next_sample
            .checked_add(u64::from(frames))
            .ok_or(ClockError::Overflow)?;
        Ok(PacketTiming {
            first_sample,
            start_ns,
            end_ns,
            native_capture_ns,
            new_anchor,
            clock_discontinuity,
            native_timestamp_usable: !self.native_clock_discontinuous,
        })
    }
}
