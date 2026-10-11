use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use crossbeam_channel::{Receiver, Sender, TryRecvError, TrySendError, bounded};
use windows::{
    Foundation::{TimeSpan, TypedEventHandler},
    Media::{
        Core::{MediaStreamSample, MediaStreamSource, VideoStreamDescriptor},
        MediaProperties::{
            MediaEncodingProfile, MediaEncodingSubtypes, VideoEncodingProperties,
            VideoEncodingQuality,
        },
        Transcoding::MediaTranscoder,
    },
    Storage::{FileAccessMode, StorageFile},
    core::HSTRING,
};
use windows_capture::frame::Frame;
use windows_future::IAsyncActionWithProgress;

use super::encoder_surface::{OwnedSurface, SurfaceCopies};
use super::sample_pump::SamplePump;
use crate::screen::recording_queue::{FrameQueuePressure, frame_queue_capacity};
use crate::screen::{PixelCrop, ScreenCaptureMetrics};

const FINALIZE_TIMEOUT: Duration = Duration::from_secs(15);

/// Own the native encoder queue: windows-capture's VideoEncoder uses an
/// unbounded channel and joins its transcode thread without an exit deadline.
pub(super) struct RecordingEncoder {
    sender: Option<Sender<MediaStreamSample>>,
    completion: Receiver<Result<(), String>>,
    completion_result: Option<Result<(), String>>,
    action: IAsyncActionWithProgress<f64>,
    source: MediaStreamSource,
    starting_token: i64,
    pump: SamplePump,
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
        if width == 0
            || height == 0
            || !width.is_multiple_of(2)
            || !height.is_multiple_of(2)
            || fps == 0
            || bitrate == 0
        {
            return Err("Windows encoder requires nonempty even dimensions, a nonzero bitrate and frame rate".into());
        }
        let deadline = super::async_wait::initialization_deadline();
        let capacity = frame_queue_capacity(width, height).map_err(|error| error.to_string())?;
        std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(output)
            .map_err(message)?;
        let profile =
            MediaEncodingProfile::CreateMp4(VideoEncodingQuality::Auto).map_err(message)?;
        profile.SetAudio(None).map_err(message)?;
        let video = profile.Video().map_err(message)?;
        video.SetWidth(width).map_err(message)?;
        video.SetHeight(height).map_err(message)?;
        video.SetBitrate(bitrate).map_err(message)?;
        video
            .FrameRate()
            .and_then(|rate| {
                rate.SetNumerator(fps)?;
                rate.SetDenominator(1)
            })
            .map_err(message)?;
        let raw = VideoEncodingProperties::CreateUncompressed(
            &MediaEncodingSubtypes::Bgra8().map_err(message)?,
            width,
            height,
        )
        .map_err(message)?;
        raw.FrameRate()
            .and_then(|rate| {
                rate.SetNumerator(fps)?;
                rate.SetDenominator(1)
            })
            .map_err(message)?;
        let descriptor = VideoStreamDescriptor::Create(&raw).map_err(message)?;
        let source = MediaStreamSource::CreateFromDescriptor(&descriptor).map_err(message)?;
        source
            .SetBufferTime(TimeSpan { Duration: 0 })
            .map_err(message)?;
        let starting_token = source
            .Starting(&TypedEventHandler::new(
                |_,
                 args: windows::core::Ref<
                    windows::Media::Core::MediaStreamSourceStartingEventArgs,
                >| {
                    args.as_ref()
                        .ok_or_else(|| {
                            windows::core::Error::from_hresult(windows::core::HRESULT(
                                0x80004003_u32 as i32,
                            ))
                        })?
                        .Request()?
                        .SetActualStartPosition(TimeSpan { Duration: 0 })
                },
            ))
            .map_err(message)?;
        let (sender, receiver) = bounded::<MediaStreamSample>(capacity);
        let pump = SamplePump::attach(&source, receiver)?;
        let canonical = std::fs::canonicalize(output).map_err(message)?;
        // WinRT requires a DOS/UNC path rather than Rust's extended-length prefix.
        let path = canonical.to_string_lossy();
        let path = path.strip_prefix("\\\\?\\UNC\\").map_or_else(
            || path.strip_prefix("\\\\?\\").unwrap_or(&path).to_owned(),
            |unc| format!("\\\\{unc}"),
        );
        let file = super::async_wait::wait(
            StorageFile::GetFileFromPathAsync(&HSTRING::from(path)).map_err(message)?,
            deadline,
        )?;
        let output = super::async_wait::wait(
            file.OpenAsync(FileAccessMode::ReadWrite).map_err(message)?,
            deadline,
        )?;
        let transcoder = MediaTranscoder::new().map_err(message)?;
        transcoder
            .SetHardwareAccelerationEnabled(true)
            .map_err(message)?;
        let prepared = super::async_wait::wait(
            transcoder
                .PrepareMediaStreamSourceTranscodeAsync(&source, &output, &profile)
                .map_err(message)?,
            deadline,
        )?;
        if !prepared.CanTranscode().map_err(message)? {
            return Err(format!(
                "Windows cannot encode this recording: {:?}",
                prepared.FailureReason().map_err(message)?
            ));
        }
        let action = prepared.TranscodeAsync().map_err(message)?;
        let (completed, completion) = bounded(1);
        action
            .when(move |result| {
                let _ = completed.try_send(result.map_err(message));
                drop(transcoder);
            })
            .map_err(message)?;
        Ok(Self {
            sender: Some(sender),
            completion,
            completion_result: None,
            action,
            source,
            starting_token,
            pump,
            surfaces: SurfaceCopies::new(width, height, capacity + 1),
            metrics: Arc::new(ScreenCaptureMetrics::default()),
            last_frame: None,
            last_output_timestamp: None,
            frame_duration: (10_000_000 / i64::from(fps.max(1))).max(1),
            first_timestamp: None,
            pressure: FrameQueuePressure::default(),
        })
    }

    pub(super) fn has_capacity(&mut self) -> Result<bool, String> {
        self.check_running()?;
        let available = self.sender.as_ref().is_some_and(|sender| !sender.is_full())
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
        self.pump.check()?;
        if self.completion_result.is_none() {
            self.completion_result = match self.completion.try_recv() {
                Ok(result) => Some(result),
                Err(TryRecvError::Empty) => None,
                Err(TryRecvError::Disconnected) => {
                    Some(Err("Windows encoder worker exited unexpectedly".into()))
                }
            };
        }
        match &self.completion_result {
            Some(Ok(())) => Err("Windows encoder stopped before recording finished".into()),
            Some(Err(error)) => Err(error.clone()),
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
        while self.last_frame.is_some() && self.sender.as_ref().is_some_and(Sender::is_full) {
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
        self.sender.take();
        self.last_frame.take();
        if let Some(result) = self.completion_result.take() {
            return result;
        }
        let result = self
            .completion
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .map_err(|_| {
                "Windows encoder did not finish within 15 seconds; recording was stopped".to_owned()
            })?;
        let stopped = self.pump.stop();
        result.and(stopped)
    }
}

impl Drop for RecordingEncoder {
    fn drop(&mut self) {
        self.sender.take();
        let _ = self.action.Cancel();
        let _ = self.pump.stop();
        let _ = self.source.RemoveStarting(self.starting_token);
    }
}

fn message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(all(test, feature = "hardware-tests"))]
#[path = "encoder_tests.rs"]
mod tests;
