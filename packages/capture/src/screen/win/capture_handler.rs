use super::encoder::RecordingEncoder;
use crate::{
    CaptureError,
    model::ScreenRegion,
    screen::{ScreenCaptureMetrics, normalize_crop, recording_queue::FrameCadence},
    session::StartGate,
};
use parking_lot::Mutex;
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};
use windows_capture::{
    capture::{Context, GraphicsCaptureApiHandler},
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
};

#[derive(Default)]
pub(super) struct CaptureHealth {
    pub failure: Option<String>,
    pub encoded_size: Option<(u32, u32)>,
    pub callback_since: Option<Instant>,
}
impl CaptureHealth {
    pub(super) fn fail(&mut self, error: impl ToString) {
        self.failure.get_or_insert_with(|| error.to_string());
    }
}

pub(super) struct HandlerFlags {
    pub output: PathBuf,
    pub bitrate: u32,
    pub fps: u32,
    pub metrics: Arc<ScreenCaptureMetrics>,
    pub start_gate: Arc<StartGate>,
    pub region: Option<ScreenRegion>,
    pub health: Arc<Mutex<CaptureHealth>>,
    pub stopping: Arc<AtomicBool>,
}

pub(super) struct CaptureHandler {
    pub(super) encoder: Option<RecordingEncoder>,
    pub(super) pending_encoder: Option<HandlerFlags>,
    pub(super) health: Arc<Mutex<CaptureHealth>>,
    metrics: Arc<ScreenCaptureMetrics>,
    start_gate: Arc<StartGate>,
    region: Option<ScreenRegion>,
    cadence: FrameCadence,
    stopping: Arc<AtomicBool>,
}

impl CaptureHandler {
    pub(super) fn from_flags(flags: HandlerFlags) -> Self {
        Self {
            encoder: None,
            health: flags.health.clone(),
            metrics: flags.metrics.clone(),
            start_gate: flags.start_gate.clone(),
            region: flags.region,
            cadence: FrameCadence::new(flags.fps),
            stopping: flags.stopping.clone(),
            pending_encoder: Some(flags),
        }
    }
    #[cfg(test)]
    pub(super) fn finish(&mut self) -> Result<(), CaptureError> {
        self.finish_at(Instant::now())
    }
    pub(super) fn finish_at(&mut self, stopped_at: Instant) -> Result<(), CaptureError> {
        self.pending_encoder = None;
        if let Some(encoder) = self.encoder.take() {
            encoder
                .finish_at(stopped_at)
                .map_err(CaptureError::Backend)?;
        }
        Ok(())
    }
    pub(super) fn probe(&mut self) -> Result<(), String> {
        if let Some(encoder) = self.encoder.as_mut() {
            encoder.has_capacity()?;
            encoder.refresh_still(Instant::now(), false)?;
        }
        Ok(())
    }
    fn process_frame(&mut self, frame: &mut Frame) -> Result<(), String> {
        if self.stopping.load(Ordering::Acquire) {
            return Ok(());
        }
        if !self.start_gate.is_released()
            && let Err(error) = self.start_gate.wait()
        {
            if self.stopping.load(Ordering::Acquire) {
                return Ok(());
            }
            return Err(error.to_string());
        }
        if self.stopping.load(Ordering::Acquire) {
            return Ok(());
        }
        let captured_at = Instant::now();
        self.metrics.acquired_frame();
        let timestamp = frame
            .timestamp()
            .map_err(|error| error.to_string())?
            .Duration;
        if !self.cadence.accepts(timestamp) {
            self.metrics.dropped_frames(1);
            return Ok(());
        }
        let crop = normalize_crop(
            self.region.unwrap_or(ScreenRegion {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
            }),
            frame.width(),
            frame.height(),
        )
        .map_err(|error| error.to_string())?;
        if let Some(settings) = self.pending_encoder.take() {
            // The first actual frame supplies physical dimensions. A second
            // frame is not required: an idle selected region may never send one.
            self.encoder = Some(
                RecordingEncoder::new(
                    &settings.output,
                    crop.width(),
                    crop.height(),
                    settings.bitrate,
                    settings.fps,
                )?
                .with_metrics(self.metrics.clone()),
            );
            self.health.lock().encoded_size = Some((crop.width(), crop.height()));
            self.metrics
                .observe_video_format(crate::screen::VideoFormat {
                    width: crop.width(),
                    height: crop.height(),
                    stride: crop.width() as usize * 4,
                    pixel_format: crate::screen::PixelFormat::Bgra8,
                });
        }
        let encoder = self
            .encoder
            .as_mut()
            .ok_or("Windows video encoder was finalized")?;
        // If a window changes size, preserve its whole content in the original
        // encoded dimensions with aspect-fit GPU scaling rather than clipping.
        if encoder.send_frame(frame, crop, captured_at)? {
            self.metrics.received_frame(
                u64::try_from(timestamp)
                    .ok()
                    .and_then(|ticks| ticks.checked_mul(100)),
                false,
            );
        } else {
            self.metrics.dropped_frames(1);
        }
        Ok(())
    }
}
impl GraphicsCaptureApiHandler for CaptureHandler {
    type Flags = HandlerFlags;
    type Error = String;
    fn new(context: Context<Self::Flags>) -> Result<Self, String> {
        Ok(Self::from_flags(context.flags))
    }
    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _control: InternalCaptureControl,
    ) -> Result<(), String> {
        self.health.lock().callback_since = Some(Instant::now());
        let result = self.process_frame(frame);
        let mut health = self.health.lock();
        health.callback_since = None;
        if let Err(error) = &result {
            health.fail(error);
        }
        result
    }
    fn on_closed(&mut self) -> Result<(), String> {
        if !self.stopping.load(Ordering::Acquire) {
            self.health
                .lock()
                .fail("the selected capture source was closed");
        }
        // Finalization belongs to the bounded Stop worker, not the WGC callback.
        Ok(())
    }
}
