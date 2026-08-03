use std::sync::Arc;

mod metrics;
#[cfg(any(windows, target_os = "macos"))]
#[path = "optional_sources.rs"]
mod optional_sources;
mod source_watches;

use super::periodic_reporter::PeriodicReporter;
use super::recording_support::*;
#[cfg(any(windows, target_os = "macos"))]
use crate::model::{CursorSelection, SourceId, TrackKind};
use crate::{
    CaptureError,
    catalog::CatalogSnapshot,
    clock::SessionClock,
    model::{CaptureRequest, ScreenSelection, TrackMetadata, TrackStatus},
    storage::finish_segment,
};
#[cfg(any(windows, target_os = "macos"))]
use optional_sources::{mark_optional_failed, mark_track_failed, update_audio_metrics};
use source_watches::source_watches;

#[derive(Default)]
pub(super) struct ActiveRecordings {
    reporter: Option<PeriodicReporter>,
    #[cfg(windows)]
    screen: Option<crate::screen::win::WindowsRecording>,
    #[cfg(target_os = "macos")]
    screen: Option<crate::screen::mac::MacRecording>,
    #[cfg(windows)]
    camera: Option<crate::backends::win::camera::WindowsCameraRecording>,
    #[cfg(target_os = "macos")]
    camera: Option<crate::backends::mac::camera::MacCameraRecording>,
    #[cfg(windows)]
    microphone: Option<crate::backends::win::audio::MicrophoneRecording>,
    #[cfg(target_os = "macos")]
    microphone: Option<crate::backends::mac::audio::MicrophoneRecording>,
    #[cfg(windows)]
    system_audio: Option<crate::backends::win::system_audio::WasapiLoopbackRecording>,
    #[cfg(target_os = "macos")]
    system_audio: Option<crate::backends::mac::system_audio::ScreenCaptureAudioRecording>,
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
    pub(super) clock: Arc<SessionClock>,
    #[cfg(any(windows, target_os = "macos"))]
    pub(super) preview: Option<crate::backends::preview_stream::PreviewPublisher>,
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
            clock,
            #[cfg(any(windows, target_os = "macos"))]
            preview,
        } = context;

        #[cfg(all(windows, feature = "cursor"))]
        if let CursorSelection::Separate {
            capture_clicks,
            capture_shape,
        } = request.cursor
        {
            let region = match &request.screen {
                Some(ScreenSelection::Source { source_id }) => crate::cursor::crop_region(
                    crate::cursor::win::source_region(source_id)?,
                    request.region.unwrap_or(crate::model::ScreenRegion {
                        x: 0.0,
                        y: 0.0,
                        width: 1.0,
                        height: 1.0,
                    }),
                )?,
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
                Some(ScreenSelection::Source { source_id }) => crate::cursor::crop_region(
                    crate::cursor::mac::source_region(source_id)?,
                    request.region.unwrap_or(crate::model::ScreenRegion {
                        x: 0.0,
                        y: 0.0,
                        width: 1.0,
                        height: 1.0,
                    }),
                )?,
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
        self.open_optional_sources(
            request,
            layout,
            generation,
            start_ns,
            tracks,
            start_gate,
            clock,
            #[cfg(any(windows, target_os = "macos"))]
            preview,
        )?;

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

    #[allow(clippy::too_many_arguments)]
    fn open_optional_sources(
        &mut self,
        request: &CaptureRequest,
        layout: &crate::storage::SessionLayout,
        generation: u32,
        start_ns: u64,
        tracks: &mut [TrackMetadata],
        start_gate: &Arc<super::StartGate>,
        clock: Arc<SessionClock>,
        #[cfg(any(windows, target_os = "macos"))] preview: Option<
            crate::backends::preview_stream::PreviewPublisher,
        >,
    ) -> Result<(), CaptureError> {
        #[cfg(windows)]
        {
            if let Some(source_id) = request.camera.as_ref() {
                let path = segment_path(layout, TrackKind::Camera, generation, "mp4");
                match crate::backends::win::camera::WindowsCameraRecording::start(
                    source_id,
                    &path,
                    u32::try_from(request.recording.video_bitrate_bps).unwrap_or(u32::MAX),
                    request.recording.target_fps,
                    request.recording.queue_capacity,
                    start_gate.clone(),
                    clock.clone(),
                    preview,
                ) {
                    Ok(recording) => {
                        self.camera = Some(recording);
                        add_segment(tracks, TrackKind::Camera, generation, "mp4", start_ns)?;
                    }
                    Err(error) => mark_optional_failed(tracks, TrackKind::Camera, error),
                }
            }
            if let Some(source_id) = request.microphone.as_ref() {
                self.open_microphone(
                    source_id,
                    layout,
                    generation,
                    start_ns,
                    request.recording.queue_capacity,
                    start_gate.clone(),
                    tracks,
                )?;
            }
            if let Some(source_id) = request.system_audio.as_ref() {
                self.open_system_audio(
                    source_id,
                    layout,
                    generation,
                    start_ns,
                    request.recording.queue_capacity,
                    start_gate.clone(),
                    tracks,
                )?;
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Some(source_id) = request.camera.as_ref() {
                let path = segment_path(layout, TrackKind::Camera, generation, "mp4");
                match crate::backends::mac::camera::MacCameraRecording::start(
                    source_id,
                    &path,
                    u32::try_from(request.recording.video_bitrate_bps).unwrap_or(u32::MAX),
                    request.recording.target_fps,
                    request.recording.queue_capacity,
                    start_gate.clone(),
                    clock.clone(),
                    preview,
                ) {
                    Ok(recording) => {
                        self.camera = Some(recording);
                        add_segment(tracks, TrackKind::Camera, generation, "mp4", start_ns)?;
                    }
                    Err(error) => mark_optional_failed(tracks, TrackKind::Camera, error),
                }
            }
            if let Some(source_id) = request.microphone.as_ref() {
                self.open_microphone(
                    source_id,
                    layout,
                    generation,
                    start_ns,
                    request.recording.queue_capacity,
                    start_gate.clone(),
                    tracks,
                )?;
            }
            if let Some(source_id) = request.system_audio.as_ref() {
                self.open_system_audio(
                    source_id,
                    layout,
                    generation,
                    start_ns,
                    request.recording.queue_capacity,
                    start_gate.clone(),
                    tracks,
                )?;
            }
        }

        #[cfg(not(any(windows, target_os = "macos")))]
        let _ = (
            request, layout, generation, start_ns, tracks, start_gate, clock,
        );
        Ok(())
    }

    #[cfg(any(windows, target_os = "macos"))]
    #[allow(clippy::too_many_arguments)]
    fn open_microphone(
        &mut self,
        source_id: &SourceId,
        layout: &crate::storage::SessionLayout,
        generation: u32,
        start_ns: u64,
        queue_capacity: usize,
        start_gate: Arc<super::StartGate>,
        tracks: &mut [TrackMetadata],
    ) -> Result<(), CaptureError> {
        let output = segment_path(layout, TrackKind::Microphone, generation, "wav");
        #[cfg(windows)]
        let recording = crate::backends::win::audio::MicrophoneRecording::start(
            source_id.as_str(),
            &output,
            queue_capacity,
            start_gate,
        );
        #[cfg(target_os = "macos")]
        let recording = crate::backends::mac::audio::MicrophoneRecording::start(
            source_id.as_str(),
            &output,
            queue_capacity,
            start_gate,
        );
        match recording {
            Ok(recording) => {
                self.microphone = Some(recording);
                add_segment(
                    tracks,
                    TrackKind::Microphone,
                    generation,
                    "wav",
                    start_ns,
                )?;
            }
            Err(error) => mark_optional_failed(tracks, TrackKind::Microphone, error),
        }
        Ok(())
    }

    #[cfg(any(windows, target_os = "macos"))]
    #[allow(clippy::too_many_arguments)]
    fn open_system_audio(
        &mut self,
        source_id: &SourceId,
        layout: &crate::storage::SessionLayout,
        generation: u32,
        start_ns: u64,
        queue_capacity: usize,
        start_gate: Arc<super::StartGate>,
        tracks: &mut [TrackMetadata],
    ) -> Result<(), CaptureError> {
        let output = segment_path(layout, TrackKind::SystemAudio, generation, "wav");
        #[cfg(windows)]
        let recording = crate::backends::win::system_audio::WasapiLoopbackRecording::start(
            source_id.as_str(),
            &output,
            queue_capacity,
            start_gate,
        );
        #[cfg(target_os = "macos")]
        let recording =
            crate::backends::mac::system_audio::ScreenCaptureAudioRecording::start(
                source_id.as_str(),
                &output,
                queue_capacity,
                start_gate,
            );
        match recording {
            Ok(recording) => {
                self.system_audio = Some(recording);
                add_segment(
                    tracks,
                    TrackKind::SystemAudio,
                    generation,
                    "wav",
                    start_ns,
                )?;
            }
            Err(error) => mark_optional_failed(tracks, TrackKind::SystemAudio, error),
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
                    request.region,
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
                    request.region,
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
            let result = recording.stop();
            mark_track_failed(tracks, TrackKind::Screen, &result);
            record_result(result, &mut first_error);
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
            let result = recording.stop().map(|_| ());
            mark_track_failed(tracks, TrackKind::Screen, &result);
            record_result(result, &mut first_error);
            update_video_metrics(
                tracks,
                TrackKind::Screen,
                metrics.frames_received(),
                metrics.frames_dropped(),
            );
        }

        #[cfg(any(windows, target_os = "macos"))]
        if let Some(recording) = self.camera.take() {
            let metrics = recording.metrics();
            let result = recording.stop();
            mark_track_failed(tracks, TrackKind::Camera, &result);
            record_result(result, &mut first_error);
            update_video_metrics(
                tracks,
                TrackKind::Camera,
                metrics.frames_received(),
                metrics.frames_dropped(),
            );
            if let Some(track) = track_mut(tracks, TrackKind::Camera) {
                track.metrics.frames_encoded = metrics.frames_encoded();
                track.metrics.interruptions += metrics.interruptions();
            }
        }

        #[cfg(any(windows, target_os = "macos"))]
        if let Some(recording) = self.microphone.take() {
            let metrics = recording.metrics();
            let result = recording.stop();
            mark_track_failed(tracks, TrackKind::Microphone, &result);
            record_result(result, &mut first_error);
            update_audio_metrics(
                tracks,
                TrackKind::Microphone,
                metrics.samples_received(),
                metrics.samples_dropped(),
                metrics.interruptions(),
            );
        }

        #[cfg(any(windows, target_os = "macos"))]
        if let Some(recording) = self.system_audio.take() {
            let metrics = recording.metrics();
            let result = recording.stop();
            mark_track_failed(tracks, TrackKind::SystemAudio, &result);
            record_result(result, &mut first_error);
            update_audio_metrics(
                tracks,
                TrackKind::SystemAudio,
                metrics.samples_received(),
                metrics.samples_dropped(),
                metrics.interruptions(),
            );
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
