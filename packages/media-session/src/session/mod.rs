mod drain;
mod finish;
mod prepare;

use std::sync::Arc;

use beam_media_core::{MonotonicClock, SessionClock, StartGate};
use beam_media_encode::TrackWriter;
use beam_media_manifest::{
    ManifestWriter, SessionLayout, SessionManifest, TrackKind, TrackMetadata,
};

use crate::{
    AudioSource, CameraSource, PreviewMeasurements, ProbeLoopMeasurements, ProcessSample,
    SessionMeasurements, SessionTimeline,
};

pub struct MediaSession {
    layout: SessionLayout,
    manifest: SessionManifest,
    manifest_writer: ManifestWriter,
    measurements: SessionMeasurements,
    clock: SessionClock,
    gate: Arc<StartGate>,
    camera: Option<Box<dyn CameraSource>>,
    camera_writer: Option<TrackWriter>,
    microphone: Option<Box<dyn AudioSource>>,
    microphone_writer: Option<TrackWriter>,
    system_audio: Option<Box<dyn AudioSource>>,
    system_writer: Option<TrackWriter>,
    started: bool,
    last_checkpoint_ns: u64,
}

impl MediaSession {
    fn observe_queues(&mut self) {
        if let Some(source) = &self.camera {
            let (packets, bytes) = source.queue_depth();
            self.measurements
                .camera
                .queue_peaks
                .observe_source(packets, bytes);
        }
        if let Some(writer) = &self.camera_writer {
            let (packets, bytes) = writer.queue_depth();
            self.measurements
                .camera
                .queue_peaks
                .observe_encoder(packets, bytes);
        }
        if let Some(source) = &self.microphone {
            let (packets, bytes) = source.queue_depth();
            self.measurements
                .microphone
                .queue_peaks
                .observe_source(packets, bytes);
        }
        if let Some(writer) = &self.microphone_writer {
            let (packets, bytes) = writer.queue_depth();
            self.measurements
                .microphone
                .queue_peaks
                .observe_encoder(packets, bytes);
        }
        if let Some(source) = &self.system_audio {
            let (packets, bytes) = source.queue_depth();
            self.measurements
                .system_audio
                .queue_peaks
                .observe_source(packets, bytes);
        }
        if let Some(writer) = &self.system_writer {
            let (packets, bytes) = writer.queue_depth();
            self.measurements
                .system_audio
                .queue_peaks
                .observe_encoder(packets, bytes);
        }
    }

    fn track_mut(&mut self, kind: TrackKind) -> Option<&mut TrackMetadata> {
        self.manifest
            .tracks
            .iter_mut()
            .find(|track| track.kind == kind)
    }

    #[must_use]
    pub const fn manifest(&self) -> &SessionManifest {
        &self.manifest
    }

    #[must_use]
    pub fn manifest_path(&self) -> std::path::PathBuf {
        self.layout.manifest()
    }

    #[must_use]
    pub const fn measurements(&self) -> &SessionMeasurements {
        &self.measurements
    }

    pub fn camera_preview_frame(
        &self,
    ) -> Option<beam_media_core::VideoFrame<beam_camera::CameraFrame>> {
        self.camera.as_ref()?.latest_preview()
    }

    pub fn camera_preview_source(
        &self,
    ) -> Option<
        Arc<beam_media_core::LatestFrame<beam_media_core::VideoFrame<beam_camera::CameraFrame>>>,
    > {
        Some(self.camera.as_ref()?.preview_handle())
    }

    pub fn set_preview_measurements(&mut self, measurements: PreviewMeasurements) {
        self.measurements.preview = Some(measurements);
    }

    pub fn set_preview_error(&mut self, error: String) {
        self.measurements.preview_error = Some(error);
    }

    pub fn session_ns(&self) -> Option<u64> {
        self.gate.session_ns(self.clock.now_ns())
    }

    pub fn timeline(&self) -> SessionTimeline {
        SessionTimeline::new(self.clock.clone(), self.gate.clone())
    }

    pub fn record_process_sample(&mut self, sample: ProcessSample) {
        self.measurements.process_samples.push(sample);
    }

    pub fn set_probe_loop_measurements(&mut self, measurements: ProbeLoopMeasurements) {
        self.measurements.probe_loop = measurements;
    }
}

#[path = "../../test/session/synthetic.rs"]
mod synthetic_checks;
