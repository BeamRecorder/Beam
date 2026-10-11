use crate::CaptureError;
#[cfg(any(windows, test))]
use std::time::{Duration, Instant};

const QUEUED_FRAME_BUDGET: u64 = 64 * 1024 * 1024;

#[cfg(any(windows, test))]
#[derive(Default)]
pub(crate) struct FrameQueuePressure {
    blocked_since: Option<Instant>,
    progress: u64,
}

#[cfg(any(windows, test))]
impl FrameQueuePressure {
    pub(crate) fn check(
        &mut self,
        available: bool,
        progress: u64,
        now: Instant,
    ) -> Result<bool, CaptureError> {
        if available || self.progress != progress {
            self.blocked_since = None;
        }
        self.progress = progress;
        if available {
            return Ok(true);
        }
        let since = *self.blocked_since.get_or_insert(now);
        if now.saturating_duration_since(since) >= Duration::from_secs(30) {
            return Err(CaptureError::Backend(
                "Windows video encoder made no progress for 30 seconds; recorded media was retained".into(),
            ));
        }
        Ok(false)
    }
}

/// Count raw BGRA surfaces, rather than encoded bytes. One oversized frame is
/// still supported, but buffering can never grow with recording duration.
pub(crate) fn frame_queue_capacity(width: u32, height: u32) -> Result<usize, CaptureError> {
    let bytes = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(4))
        .filter(|bytes| *bytes > 0)
        .ok_or_else(|| CaptureError::InvalidConfiguration("invalid recording frame size".into()))?;
    Ok((QUEUED_FRAME_BUDGET / bytes).clamp(1, 3) as usize)
}

#[cfg(any(windows, test))]
pub(crate) struct FrameCadence {
    fps: i128,
    next_deadline: Option<i128>,
    last_timestamp: Option<i64>,
}

#[cfg(any(windows, test))]
impl FrameCadence {
    pub(crate) fn new(fps: u32) -> Self {
        Self {
            fps: i128::from(fps.max(1)),
            next_deadline: None,
            last_timestamp: None,
        }
    }

    /// WGC may deliver at the monitor refresh rate on older Windows versions.
    /// Limit work before copying a crop or retaining another GPU surface.
    pub(crate) fn accepts(&mut self, timestamp: i64) -> bool {
        if self.last_timestamp.is_some_and(|last| timestamp <= last) {
            return false;
        }
        // Keep the phase in rational 100 ns ticks. Rebasing on every accepted
        // frame rounds 144 Hz -> 60 fps down to 48 fps and amplifies jitter.
        let phase = i128::from(timestamp) * self.fps;
        let deadline = self.next_deadline.get_or_insert(phase);
        // One percent of a frame tolerates native timestamp jitter without
        // gradually moving the schedule or producing catch-up bursts.
        if phase + 100_000 < *deadline {
            return false;
        }
        let periods = ((phase - *deadline).max(0) / 10_000_000) + 1;
        *deadline += periods * 10_000_000;
        self.last_timestamp = Some(timestamp);
        true
    }
}

#[cfg(test)]
#[path = "recording_queue_tests.rs"]
mod tests;
