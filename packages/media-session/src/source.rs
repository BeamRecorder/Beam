//! Platform-neutral capture contracts used by the session coordinator.

use std::sync::Arc;

#[cfg(target_os = "linux")]
use beam_audio::SystemAudioCapture;
use beam_audio::{
    AudioCapture, AudioDevice, AudioError, AudioEvent, AudioQueueLimits, TimedAudioPacket,
};
use beam_camera::{
    CameraCapture, CameraDevice, CameraError, CameraEvent, CameraFormat, CameraFrame,
    CameraQueueLimits, CameraRequest,
};
use beam_media_core::{LatestFrame, SessionClock, StartGate, VideoFrame};

pub type CapturedCameraFrame = VideoFrame<CameraFrame>;

/// A bounded PCM producer. Implementations own their native stream and release it on drop.
pub trait AudioSource: Send {
    fn format(&self) -> (u32, u16);
    fn queue_depth(&self) -> (usize, usize);
    fn try_packet(&self) -> Result<Option<TimedAudioPacket>, AudioError>;
    fn try_event(&self) -> Option<AudioEvent>;
    fn halt(&mut self) -> Result<(), AudioError>;
}

impl AudioSource for AudioCapture {
    fn format(&self) -> (u32, u16) {
        (self.sample_rate, self.channels)
    }

    fn queue_depth(&self) -> (usize, usize) {
        Self::queue_depth(self)
    }

    fn try_packet(&self) -> Result<Option<TimedAudioPacket>, AudioError> {
        Self::try_packet(self)
    }

    fn try_event(&self) -> Option<AudioEvent> {
        Self::try_event(self)
    }

    fn halt(&mut self) -> Result<(), AudioError> {
        Self::halt(self)
    }
}

#[cfg(target_os = "linux")]
impl AudioSource for SystemAudioCapture {
    fn format(&self) -> (u32, u16) {
        (self.sample_rate, self.channels)
    }

    fn queue_depth(&self) -> (usize, usize) {
        Self::queue_depth(self)
    }

    fn try_packet(&self) -> Result<Option<TimedAudioPacket>, AudioError> {
        Self::try_packet(self)
    }

    fn try_event(&self) -> Option<AudioEvent> {
        Self::try_event(self)
    }

    fn halt(&mut self) -> Result<(), AudioError> {
        Self::halt(self)
    }
}

/// A bounded camera producer with an independent latest-frame preview mailbox.
pub trait CameraSource: Send {
    fn format(&self) -> CameraFormat;
    fn queue_depth(&self) -> (usize, usize);
    fn try_frame(&self) -> Result<Option<CapturedCameraFrame>, CameraError>;
    fn latest_preview(&self) -> Option<CapturedCameraFrame>;
    fn preview_handle(&self) -> Arc<LatestFrame<CapturedCameraFrame>>;
    fn try_event(&self) -> Option<CameraEvent>;
    fn halt(&mut self) -> Result<(), CameraError>;
}

/// The session's device boundary. Tests can supply bounded producers without native devices.
pub(crate) trait SourceFactory {
    fn list_cameras(&self) -> Result<Vec<CameraDevice>, CameraError>;
    fn open_camera(
        &self,
        request: CameraRequest,
        clock: SessionClock,
        gate: Arc<StartGate>,
        limits: CameraQueueLimits,
    ) -> Result<Box<dyn CameraSource>, CameraError>;
    fn list_inputs(&self) -> Result<Vec<AudioDevice>, AudioError>;
    fn open_microphone(
        &self,
        device_id: &str,
        clock: SessionClock,
        gate: Arc<StartGate>,
        limits: AudioQueueLimits,
    ) -> Result<Box<dyn AudioSource>, AudioError>;
    fn list_system_outputs(&self) -> Result<Vec<AudioDevice>, AudioError>;
    fn open_system_audio(
        &self,
        device_id: &str,
        clock: SessionClock,
        gate: Arc<StartGate>,
        limits: AudioQueueLimits,
    ) -> Result<Box<dyn AudioSource>, AudioError>;
}

pub(crate) struct NativeSources;

impl SourceFactory for NativeSources {
    fn list_cameras(&self) -> Result<Vec<CameraDevice>, CameraError> {
        beam_camera::list_cameras()
    }

    fn open_camera(
        &self,
        request: CameraRequest,
        clock: SessionClock,
        gate: Arc<StartGate>,
        limits: CameraQueueLimits,
    ) -> Result<Box<dyn CameraSource>, CameraError> {
        beam_camera::open_camera(request, clock, gate, limits)
            .map(|capture| Box::new(capture) as Box<dyn CameraSource>)
    }

    fn list_inputs(&self) -> Result<Vec<AudioDevice>, AudioError> {
        beam_audio::list_inputs()
    }

    fn open_microphone(
        &self,
        device_id: &str,
        clock: SessionClock,
        gate: Arc<StartGate>,
        limits: AudioQueueLimits,
    ) -> Result<Box<dyn AudioSource>, AudioError> {
        beam_audio::open_microphone(Some(device_id), clock, gate, limits)
            .map(|capture| Box::new(capture) as Box<dyn AudioSource>)
    }

    fn list_system_outputs(&self) -> Result<Vec<AudioDevice>, AudioError> {
        beam_audio::list_system_outputs()
    }

    fn open_system_audio(
        &self,
        device_id: &str,
        clock: SessionClock,
        gate: Arc<StartGate>,
        limits: AudioQueueLimits,
    ) -> Result<Box<dyn AudioSource>, AudioError> {
        beam_audio::open_system_audio(Some(device_id), clock, gate, limits)
            .map(|capture| Box::new(capture) as Box<dyn AudioSource>)
    }
}

impl CameraSource for CameraCapture {
    fn format(&self) -> CameraFormat {
        self.format
    }

    fn queue_depth(&self) -> (usize, usize) {
        Self::queue_depth(self)
    }

    fn try_frame(&self) -> Result<Option<CapturedCameraFrame>, CameraError> {
        Self::try_frame(self)
    }

    fn latest_preview(&self) -> Option<CapturedCameraFrame> {
        Self::latest_preview(self)
    }

    fn preview_handle(&self) -> Arc<LatestFrame<CapturedCameraFrame>> {
        Self::preview_handle(self)
    }

    fn try_event(&self) -> Option<CameraEvent> {
        Self::try_event(self)
    }

    fn halt(&mut self) -> Result<(), CameraError> {
        Self::halt(self)
    }
}

#[path = "../test/source.rs"]
mod source_checks;
