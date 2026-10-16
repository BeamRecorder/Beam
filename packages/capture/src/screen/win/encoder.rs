use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use crossbeam_channel::{Sender, TryRecvError, TrySendError};
use windows::{
    Foundation::{TimeSpan, TypedEventHandler},
    Media::Core::MediaStreamSample,
};
use windows_capture::frame::Frame;

use super::encoder_startup::{self, EncoderStartup};
use super::encoder_surface::{OwnedSurface, SurfaceCopies};
use crate::screen::encoder_negotiation::{EncoderMode, EncoderStartFailure};
use crate::screen::recording_queue::{FrameQueuePressure, frame_queue_capacity};
use crate::screen::{PixelCrop, ScreenCaptureMetrics};

const FINALIZE_TIMEOUT: Duration = Duration::from_secs(15);

/// Own the native encoder queue: windows-capture's VideoEncoder uses an
/// unbounded channel and joins its transcode thread without an exit deadline.
pub(super) struct RecordingEncoder {
    startup: EncoderStartup,
    completion_result: Option<Result<(), EncoderStartFailure>>,
    surfaces: SurfaceCopies,
    metrics: Arc<ScreenCaptureMetrics>,
    last_frame: Option<(OwnedSurface, i64, Instant)>,
    last_output_timestamp: Option<i64>,
    frame_duration: i64,
    first_timestamp: Option<i64>,
    pressure: FrameQueuePressure,
}

impl RecordingEncoder {
    pub(super) fn new(
        output: &Path,
        width: u32,
        height: u32,
        bitrate: u32,
        fps: u32,
    ) -> Result<Self, String> {
        Self::with_mode(output, width, height, bitrate, fps, None)
    }

    fn with_mode(
        output: &Path,
        width: u32,
        height: u32,
        bitrate: u32,
        fps: u32,
        mode: Option<EncoderMode>,
    ) -> Result<Self, String> {
        if width == 0
            || height == 0
            || !width.is_multiple_of(2)
            || !height.is_multiple_of(2)
            || fps == 0
            || bitrate == 0
        {
            return Err("Windows encoder requires nonempty even dimensions, a nonzero bitrate and frame rate".into());
        }
        let capacity = frame_queue_capacity(width, height).map_err(message)?;
        let startup =
            encoder_startup::initialize(output, width, height, bitrate, fps, capacity, mode)?;
        Ok(Self {
            startup,
            completion_result: None,
            surfaces: SurfaceCopies::new(width, height, capacity + 1),
            metrics: Arc::new(ScreenCaptureMetrics::default()),
            last_frame: None,
            last_output_timestamp: None,
            frame_duration: (10_000_000 / i64::from(fps)).max(1),
            first_timestamp: None,
            pressure: FrameQueuePressure::default(),
        })
    }

    pub(super) fn has_capacity(&mut self) -> Result<bool, String> {
        self.check_running()?;
        let available = self
            .startup
            .sender
            .as_ref()
            .is_some_and(|sender| !sender.is_full())
            && self.surfaces.available();
        self.pressure
            .check(available, self.metrics.frames_processed(), Instant::now())
            .map_err(message)
    }

    pub(super) fn with_metrics(mut self, metrics: Arc<ScreenCaptureMetrics>) -> Self {
        self.metrics = metrics;
        self
    }

    pub(super) fn send_frame(
        &mut self,
        frame: &Frame,
        crop: PixelCrop,
        captured_at: Instant,
    ) -> Result<bool, String> {
        self.send_texture_at(
            frame.device(),
            frame.device_context(),
            frame.as_raw_texture(),
            crop,
            frame.timestamp().map_err(message)?.Duration,
            captured_at,
        )
    }

    #[cfg(all(test, feature = "hardware-tests"))]
    pub(super) fn send_texture(
        &mut self,
        device: &windows::Win32::Graphics::Direct3D11::ID3D11Device,
        context: &windows::Win32::Graphics::Direct3D11::ID3D11DeviceContext,
        texture: &windows::Win32::Graphics::Direct3D11::ID3D11Texture2D,
        crop: PixelCrop,
        timestamp: i64,
    ) -> Result<bool, String> {
        self.send_texture_at(device, context, texture, crop, timestamp, Instant::now())
    }

    fn send_texture_at(
        &mut self,
        device: &windows::Win32::Graphics::Direct3D11::ID3D11Device,
        context: &windows::Win32::Graphics::Direct3D11::ID3D11DeviceContext,
        texture: &windows::Win32::Graphics::Direct3D11::ID3D11Texture2D,
        crop: PixelCrop,
        timestamp: i64,
        captured_at: Instant,
    ) -> Result<bool, String> {
        if !self.has_capacity()? {
            return Ok(false);
        }
        let timestamp = self.timestamp(timestamp).Duration;
        if self
            .last_output_timestamp
            .is_some_and(|last| timestamp <= last)
        {
            return Ok(false);
        }
        let Some(owned) = self
            .surfaces
            .copy(device, context, texture, crop)
            .map_err(message)?
        else {
            return Ok(false);
        };
        let sample = self.surface_sample(&owned, timestamp)?;
        if self.send(sample)? {
            self.last_frame = Some((owned, timestamp, captured_at));
            return Ok(true);
        }
        Ok(false)
    }

    fn surface_sample(
        &self,
        owned: &OwnedSurface,
        timestamp: i64,
    ) -> Result<MediaStreamSample, String> {
        let sample = MediaStreamSample::CreateFromDirect3D11Surface(
            &owned.surface().map_err(message)?,
            TimeSpan {
                Duration: timestamp,
            },
        )
        .map_err(message)?;
        // Processed marks the point at which Media Foundation no longer reads
        // this surface. A retained still may continue to own the same lease.
        let lease = Mutex::new(Some(owned.lease.clone()));
        let metrics = self.metrics.clone();
        sample
            .Processed(&TypedEventHandler::new(move |_, _| {
                if lease
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner)
                    .take()
                    .is_some()
                {
                    metrics.processed_frame();
                }
                Ok(())
            }))
            .map_err(message)?;
        Ok(sample)
    }

    pub(super) fn refresh_still(&mut self, now: Instant, force: bool) -> Result<bool, String> {
        self.check_running()?;
        let Some((owned, timestamp, captured_at)) = &self.last_frame else {
            return Ok(false);
        };
        let elapsed = now.saturating_duration_since(*captured_at).as_nanos() / 100;
        let timestamp = timestamp.saturating_add(i64::try_from(elapsed).unwrap_or(i64::MAX));
        let last = self.last_output_timestamp.unwrap_or(0);
        if timestamp <= last || (!force && timestamp.saturating_sub(last) < 10_000_000) {
            return Ok(false);
        }
        let sample = self.surface_sample(owned, timestamp)?;
        self.send(sample)
    }

    fn send(&mut self, sample: MediaStreamSample) -> Result<bool, String> {
        self.check_running()?;
        let timestamp = sample.Timestamp().map_err(message)?.Duration;
        sample
            .SetDuration(TimeSpan {
                Duration: self.frame_duration,
            })
            .map_err(message)?;
        match self
            .startup
            .sender
            .as_ref()
            .ok_or("Windows encoder was finalized")?
            .try_send(sample)
        {
            Ok(()) => {
                self.last_output_timestamp = Some(timestamp);
                self.metrics.submitted_frame();
                Ok(true)
            }
            Err(TrySendError::Full(_)) => Ok(false),
            Err(TrySendError::Disconnected(_)) => {
                Err("Windows encoder stopped accepting frames".into())
            }
        }
    }

    fn check_running(&mut self) -> Result<(), String> {
        self.startup.pump.check()?;
        if self.completion_result.is_none() {
            self.completion_result = match self.startup.completion.try_recv() {
                Ok(result) => Some(result),
                Err(TryRecvError::Empty) => None,
                Err(TryRecvError::Disconnected) => Some(Err(EncoderStartFailure::terminal(
                    "Windows encoder worker exited unexpectedly",
                ))),
            };
        }
        match &self.completion_result {
            Some(Ok(())) => Err("Windows encoder stopped before recording finished".into()),
            Some(Err(error)) => Err(error.message.clone()),
            None => Ok(()),
        }
    }

    fn timestamp(&mut self, timestamp: i64) -> TimeSpan {
        let first = *self.first_timestamp.get_or_insert(timestamp);
        TimeSpan {
            Duration: timestamp.saturating_sub(first),
        }
    }

    #[cfg(all(test, feature = "hardware-tests"))]
    pub(super) fn finish(self) -> Result<(), String> {
        self.finish_at(Instant::now())
    }

    pub(super) fn finish_at(mut self, stopped_at: Instant) -> Result<(), String> {
        let deadline = Instant::now() + FINALIZE_TIMEOUT;
        // WGC reports changed content. Publish the retained image at Stop so
        // the final static interval is represented in the media timeline.
        while self.last_frame.is_some() && self.startup.sender.as_ref().is_some_and(Sender::is_full)
        {
            self.check_running()?;
            if Instant::now() >= deadline {
                return Err("Windows encoder could not drain before finalization deadline; media was preserved".into());
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        if self.last_frame.is_some() {
            self.refresh_still(stopped_at, true)?;
        }
        // Closing the producer delivers EOS after at most the bounded queue.
        self.startup.sender.take();
        self.last_frame.take();
        if let Some(result) = self.completion_result.take() {
            return result.map_err(|error| error.message);
        }
        let result = self
            .startup
            .completion
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .map_err(|_| {
                "Windows encoder did not finish within 15 seconds; recording was stopped".to_owned()
            })?;
        let stopped = self.startup.pump.stop();
        result.map_err(|error| error.message).and(stopped)
    }
}

fn message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(all(test, feature = "hardware-tests"))]
#[path = "encoder_tests.rs"]
mod tests;

#[cfg(all(test, feature = "hardware-tests"))]
#[path = "encoder_startup_tests.rs"]
mod startup_tests;
