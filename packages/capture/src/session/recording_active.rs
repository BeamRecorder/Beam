use std::sync::Arc;

mod metrics;
mod source_watches;

use crate::{
    CaptureError,
    catalog::CatalogSnapshot,
    model::{CaptureRequest, ScreenSelection, TrackKind, TrackMetadata, TrackStatus},
    storage::finish_segment,
};

#[cfg(any(windows, target_os = "macos"))]
use crate::model::CursorSelection;
#[cfg(any(feature = "microphone", feature = "system-audio", feature = "camera"))]
use crate::model::TrackFormat;

use super::periodic_reporter::PeriodicReporter;
use super::recording_support::*;
use source_watches::source_watches;

#[derive(Default)]
pub(super) struct ActiveRecordings {
    reporter: Option<PeriodicReporter>,
    #[cfg(windows)]
    screen: Option<crate::screen::win::WindowsRecording>,
    #[cfg(target_os = "macos")]
    screen: Option<crate::screen::mac::MacRecording>,
    #[cfg(feature = "microphone")]
    microphone: Option<crate::audio::microphone::MicrophoneRecording>,
    #[cfg(all(windows, feature = "system-audio"))]
    system_audio: Option<crate::audio::system::win::WasapiLoopbackRecording>,
    #[cfg(all(target_os = "macos", feature = "system-audio"))]
    system_audio: Option<crate::audio::system::mac::MacSystemAudioRecording>,
    #[cfg(all(windows, feature = "camera"))]
    camera: Option<crate::camera::win::WindowsCameraRecording>,
    #[cfg(all(target_os = "macos", feature = "camera"))]
    camera: Option<crate::camera::mac::MacCameraRecording>,
    #[cfg(all(windows, feature = "cursor"))]
    cursor: Option<crate::cursor::win::WindowsCursorRecording>,
    #[cfg(all(target_os = "macos", feature = "cursor"))]
    cursor: Option<crate::cursor::mac::MacCursorRecording>,
}

pub(super) struct OpenContext<'a> {
    pub(super) request: &'a CaptureRequest,
    pub(super) snapshot: &'a CatalogSnapshot,
    pub(super) layout: &'a crate::storage::SessionLayout,
    pub(super) generation: u32,
    pub(super) start_ns: u64,
    pub(super) tracks: &'a mut [TrackMetadata],
    pub(super) start_gate: &'a Arc<super::StartGate>,
}

impl ActiveRecordings {
    pub(super) fn open(&mut self, context: OpenContext<'_>) -> Result<(), CaptureError> {
        let OpenContext {
            request,
            snapshot,
            layout,
            generation,
            start_ns,
            tracks,
            start_gate,
        } = context;
        #[cfg(feature = "microphone")]
        if let Some(selection) = &request.microphone {
            let path = segment_path(layout, TrackKind::Microphone, generation, "wav");
            self.microphone = match crate::audio::microphone::MicrophoneRecording::start(
                selection,
                &path,
                request.recording.queue_capacity,
                start_gate.clone(),
            ) {
                Ok(recording) => Some(recording),
                Err(error) => {
                    optional_failure(request, tracks, TrackKind::Microphone, error)?;
                    None
                }
            };
            if let Some(track) = track_mut(tracks, TrackKind::Microphone)
                && let Some(recording) = &self.microphone
            {
                track.format = TrackFormat::Audio {
                    sample_format: "f32".into(),
                    sample_rate: recording.sample_rate(),
                    channels: recording.channels(),
                };
            }
            if self.microphone.is_some() {
                add_segment(tracks, TrackKind::Microphone, generation, "wav", start_ns)?;
            }
        }
        #[cfg(all(windows, feature = "system-audio"))]
        if let Some(selection) = &request.system_audio {
            let source = match selection {
                crate::model::SystemAudioSelection::OutputDevice(source) => Some(source),
                crate::model::SystemAudioSelection::DefaultMix
                | crate::model::SystemAudioSelection::ScreenCaptureMix => None,
            };
            let path = segment_path(layout, TrackKind::SystemAudio, generation, "wav");
            self.system_audio = match crate::audio::system::win::WasapiLoopbackRecording::start(
                source,
                &path,
                start_gate.clone(),
            ) {
                Ok(recording) => Some(recording),
                Err(error) => {
                    optional_failure(request, tracks, TrackKind::SystemAudio, error)?;
                    None
                }
            };
            if let (Some(track), Some(recording)) = (
                track_mut(tracks, TrackKind::SystemAudio),
                &self.system_audio,
            ) {
                track.format = TrackFormat::Audio {
                    sample_format: "f32".into(),
                    sample_rate: recording.sample_rate(),
                    channels: recording.channels(),
                };
            }
            if self.system_audio.is_some() {
                add_segment(tracks, TrackKind::SystemAudio, generation, "wav", start_ns)?;
            }
        }
        #[cfg(all(target_os = "macos", feature = "system-audio"))]
        if request.system_audio.is_some() {
            let source_id = match &request.screen {
                Some(ScreenSelection::Source { source_id }) => source_id,
                _ => {
                    return Err(CaptureError::InvalidConfiguration(
                        "macOS system audio requires a direct captured source".into(),
                    ));
                }
            };
            let path = segment_path(layout, TrackKind::SystemAudio, generation, "wav");
            self.system_audio = match crate::audio::system::mac::MacSystemAudioRecording::start(
                source_id,
                &path,
                request.recording.queue_capacity,
                start_gate.clone(),
            ) {
                Ok(recording) => Some(recording),
                Err(error) => {
                    optional_failure(request, tracks, TrackKind::SystemAudio, error)?;
                    None
                }
            };
            if let Some(track) = track_mut(tracks, TrackKind::SystemAudio) {
                track.format = TrackFormat::Audio {
                    sample_format: "f32".into(),
                    sample_rate: 48_000,
                    channels: 2,
                };
            }
            if self.system_audio.is_some() {
                add_segment(tracks, TrackKind::SystemAudio, generation, "wav", start_ns)?;
            }
        }
        #[cfg(all(windows, feature = "camera"))]
        if let Some(selection) = &request.camera {
            let path = segment_path(layout, TrackKind::Camera, generation, "mp4");
            self.camera = match crate::camera::win::WindowsCameraRecording::start(
                selection,
                &path,
                u32::try_from(request.recording.video_bitrate_bps / 2).unwrap_or(u32::MAX),
                request.recording.queue_capacity,
                start_gate.clone(),
            ) {
                Ok(recording) => Some(recording),
                Err(error) => {
                    optional_failure(request, tracks, TrackKind::Camera, error)?;
                    None
                }
            };
            if let (Some(track), Some(recording)) =
                (track_mut(tracks, TrackKind::Camera), &self.camera)
            {
                let format = recording.format();
                track.format = TrackFormat::Video {
                    codec: "h264".into(),
                    width: format.resolution.width,
                    height: format.resolution.height,
                    nominal_fps: format.framerate,
                };
            }
            if self.camera.is_some() {
                add_segment(tracks, TrackKind::Camera, generation, "mp4", start_ns)?;
            }
        }
        #[cfg(all(target_os = "macos", feature = "camera"))]
        if let Some(selection) = &request.camera {
            let path = segment_path(layout, TrackKind::Camera, generation, "mp4");
            self.camera = match crate::camera::mac::MacCameraRecording::start(
                selection,
                &path,
                start_gate.clone(),
                request.recording.queue_capacity,
            ) {
                Ok(recording) => Some(recording),
                Err(error) => {
                    optional_failure(request, tracks, TrackKind::Camera, error)?;
                    None
                }
            };
            if let (Some(track), Some(recording)) =
                (track_mut(tracks, TrackKind::Camera), &self.camera)
            {
                let format = recording.format();
                track.format = TrackFormat::Video {
                    codec: "h264".into(),
                    width: format.resolution.width,
                    height: format.resolution.height,
                    nominal_fps: format.framerate,
                };
            }
            if self.camera.is_some() {
                add_segment(tracks, TrackKind::Camera, generation, "mp4", start_ns)?;
            }
        }
        #[cfg(all(windows, feature = "cursor"))]
        if let CursorSelection::Separate {
            capture_clicks,
            capture_shape,
        } = request.cursor
        {
            let region = match &request.screen {
                Some(ScreenSelection::Source { source_id }) => {
                    crate::cursor::win::source_region(source_id)?
                }
                _ => crate::cursor::CaptureRegion {
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };
            self.cursor = Some(crate::cursor::win::WindowsCursorRecording::start(
                &layout.track_dir(TrackKind::Cursor),
                region,
                capture_clicks,
                capture_shape,
                start_ns,
                start_gate.clone(),
            )?);
            let track = track_mut(tracks, TrackKind::Cursor)
                .ok_or_else(|| CaptureError::Backend("missing cursor track metadata".into()))?;
            track.segments.push(crate::storage::segment(
                "cursor/cursor.json".into(),
                start_ns,
            ));
            track.status = TrackStatus::Recording;
        }
        #[cfg(all(target_os = "macos", feature = "cursor"))]
        if let CursorSelection::Separate { capture_clicks, .. } = request.cursor {
            let region = match &request.screen {
                Some(ScreenSelection::Source { source_id }) => {
                    crate::cursor::mac::source_region(source_id)?
                }
                _ => crate::cursor::CaptureRegion {
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 1,
                },
            };
            self.cursor = Some(crate::cursor::mac::MacCursorRecording::start(
                &layout.track_dir(TrackKind::Cursor),
                region,
                capture_clicks,
                start_ns,
                start_gate.clone(),
            )?);
            let track = track_mut(tracks, TrackKind::Cursor)
                .ok_or_else(|| CaptureError::Backend("missing cursor track metadata".into()))?;
            track.segments.push(crate::storage::segment(
                "cursor/cursor.json".into(),
                start_ns,
            ));
            track.status = TrackStatus::Recording;
        }
        self.open_screen(request, layout, generation, start_ns, tracks, start_gate)?;
        let _ = snapshot;
        let samplers = metrics::samplers(self, tracks);
        if !samplers.is_empty() {
            self.reporter = Some(PeriodicReporter::start(
                layout.health(),
                layout.timing(),
                start_gate.clone(),
                start_ns,
                samplers,
                source_watches(request, snapshot, tracks),
            )?);
        }
        Ok(())
    }

    fn open_screen(
        &mut self,
        request: &CaptureRequest,
        layout: &crate::storage::SessionLayout,
        generation: u32,
        start_ns: u64,
        tracks: &mut [TrackMetadata],
        start_gate: &Arc<super::StartGate>,
    ) -> Result<(), CaptureError> {
        let Some(ScreenSelection::Source { source_id }) = &request.screen else {
            return Ok(());
        };
        #[cfg(any(windows, target_os = "macos"))]
        {
            let path = segment_path(layout, TrackKind::Screen, generation, "mp4");
            #[cfg(windows)]
            {
                self.screen = Some(crate::screen::win::WindowsRecording::start(
                    source_id,
                    &path,
                    u32::try_from(request.recording.video_bitrate_bps).unwrap_or(u32::MAX),
                    request.recording.target_fps,
                    matches!(request.cursor, CursorSelection::Separate { .. }),
                    start_gate.clone(),
                )?);
            }
            #[cfg(target_os = "macos")]
            {
                self.screen = Some(crate::screen::mac::MacRecording::start(
                    source_id,
                    &path,
                    request.recording.target_fps,
                    matches!(request.cursor, CursorSelection::Separate { .. }),
                    start_gate.clone(),
                )?);
            }
            add_segment(tracks, TrackKind::Screen, generation, "mp4", start_ns)?;
            Ok(())
        }
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = (source_id, layout, generation, start_ns, tracks, start_gate);
            Err(CaptureError::Unsupported(
                "native session screen recording is unavailable on this platform".into(),
            ))
        }
    }

    pub(super) fn stop(
        &mut self,
        tracks: &mut [TrackMetadata],
        end_ns: u64,
    ) -> Result<(), CaptureError> {
        #[allow(unused_mut)]
        let mut first_error = None;
        if let Some(reporter) = self.reporter.take() {
            record_result(reporter.stop(), &mut first_error);
        }
        #[cfg(windows)]
        if let Some(recording) = self.screen.take() {
            let metrics = recording.metrics();
            record_result(recording.stop(), &mut first_error);
            update_video_metrics(
                tracks,
                TrackKind::Screen,
                metrics.frames_received(),
                metrics.frames_dropped(),
            );
        }
        #[cfg(target_os = "macos")]
        if let Some(recording) = self.screen.take() {
            let metrics = recording.metrics();
            record_result(recording.stop().map(|_| ()), &mut first_error);
            update_video_metrics(
                tracks,
                TrackKind::Screen,
                metrics.frames_received(),
                metrics.frames_dropped(),
            );
        }
        #[cfg(feature = "microphone")]
        if let Some(recording) = self.microphone.take() {
            let metrics = recording.metrics();
            record_result(recording.stop().map(|_| ()), &mut first_error);
            update_audio_metrics(
                tracks,
                TrackKind::Microphone,
                metrics.samples_received(),
                metrics.samples_dropped(),
                metrics.interruptions(),
            );
        }
        #[cfg(all(windows, feature = "system-audio"))]
        if let Some(recording) = self.system_audio.take() {
            let metrics = recording.metrics();
            record_result(recording.stop().map(|_| ()), &mut first_error);
            update_audio_metrics(
                tracks,
                TrackKind::SystemAudio,
                metrics.samples_received(),
                0,
                metrics.interruptions(),
            );
        }
        #[cfg(all(target_os = "macos", feature = "system-audio"))]
        if let Some(recording) = self.system_audio.take() {
            let metrics = recording.metrics();
            record_result(recording.stop().map(|_| ()), &mut first_error);
            update_audio_metrics(
                tracks,
                TrackKind::SystemAudio,
                metrics.samples_received(),
                metrics.samples_dropped(),
                metrics.interruptions(),
            );
        }
        #[cfg(all(windows, feature = "camera"))]
        if let Some(recording) = self.camera.take() {
            let metrics = recording.metrics();
            record_result(recording.stop().map(|_| ()), &mut first_error);
            if let Some(track) = track_mut(tracks, TrackKind::Camera) {
                track.metrics.frames_acquired += metrics.frames_acquired();
                track.metrics.frames_encoded += metrics.frames_encoded();
                track.metrics.frames_received += metrics.frames_encoded();
                track.metrics.frames_dropped += metrics.frames_dropped();
                track.metrics.interruptions += metrics.interruptions();
            }
        }
        #[cfg(all(target_os = "macos", feature = "camera"))]
        if let Some(recording) = self.camera.take() {
            let metrics = recording.metrics();
            record_result(recording.stop().map(|_| ()), &mut first_error);
            if let Some(track) = track_mut(tracks, TrackKind::Camera) {
                track.metrics.frames_acquired += metrics.frames_acquired();
                track.metrics.frames_encoded += metrics.frames_encoded();
                track.metrics.frames_received += metrics.frames_encoded();
                track.metrics.frames_dropped += metrics.frames_dropped();
                track.metrics.interruptions += metrics.interruptions();
            }
        }
        #[cfg(all(windows, feature = "cursor"))]
        if let Some(recording) = self.cursor.take() {
            let metrics = recording.metrics();
            record_result(recording.stop(), &mut first_error);
            if let Some(track) = track_mut(tracks, TrackKind::Cursor) {
                track.metrics.frames_received += metrics.events();
                track.metrics.interruptions += metrics.interruptions();
            }
        }
        #[cfg(all(target_os = "macos", feature = "cursor"))]
        if let Some(recording) = self.cursor.take() {
            let metrics = recording.metrics();
            record_result(recording.stop(), &mut first_error);
            if let Some(track) = track_mut(tracks, TrackKind::Cursor) {
                track.metrics.frames_received += metrics.events();
                track.metrics.interruptions += metrics.interruptions();
            }
        }
        for track in tracks
            .iter_mut()
            .filter(|track| track.status == TrackStatus::Recording)
        {
            if let Some(last) = track.segments.last_mut() {
                finish_segment(last, end_ns)?;
            }
            track.status = TrackStatus::Paused;
        }
        if let Some(error) = first_error {
            return Err(error);
        }
        Ok(())
    }
}
