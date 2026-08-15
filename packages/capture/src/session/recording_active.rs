use std::sync::Arc;

mod metrics;
mod source_watches;

use crate::{
    CaptureError,
    catalog::CatalogSnapshot,
    model::{CaptureRequest, CursorSelection, ScreenSelection, TrackMetadata, TrackStatus},
    storage::finish_segment,
};

use crate::model::TrackKind;

use super::periodic_reporter::PeriodicReporter;
use super::recording_support::*;
use source_watches::source_watches;

#[derive(Default)]
pub(super) struct ActiveRecordings {
    reporter: Option<PeriodicReporter>,
    screen: Option<crate::screen::ScreenRecording>,
    system_audio: Option<crate::system_audio::SystemAudioRecording>,
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
    pub(super) tracks: &'a mut Vec<TrackMetadata>,
    pub(super) start_gate: &'a Arc<super::StartGate>,
}

impl ActiveRecordings {
    pub(super) fn has_screen(&self) -> bool {
        self.screen.is_some()
    }

    pub(super) fn system_audio_level(&self) -> Option<f32> {
        self.system_audio
            .as_ref()
            .map(|recording| recording.metrics().take_peak())
    }

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
        #[cfg(all(windows, feature = "cursor"))]
        if let CursorSelection::Separate {
            capture_clicks,
            capture_shortcuts,
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
                capture_shortcuts,
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
        if let CursorSelection::Separate {
            capture_clicks,
            capture_shortcuts,
            ..
        } = request.cursor
        {
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
                capture_shortcuts,
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
        self.open_system_audio(request, layout, generation, start_ns, tracks, start_gate)?;
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

    fn open_system_audio(
        &mut self,
        request: &CaptureRequest,
        layout: &crate::storage::SessionLayout,
        generation: u32,
        start_ns: u64,
        tracks: &mut Vec<TrackMetadata>,
        start_gate: &Arc<super::StartGate>,
    ) -> Result<(), CaptureError> {
        let Some(selection) = request.system_audio else {
            return Ok(());
        };
        let path = segment_path(layout, TrackKind::SystemAudio, generation, "wav");
        let mut recording = crate::system_audio::SystemAudioRecording::open(
            crate::system_audio::SystemAudioOpenRequest {
                selection,
                segment: crate::system_audio::SystemAudioSegment { path, start_ns },
                start_gate: start_gate.clone(),
                queue_capacity: request.recording.queue_capacity,
            },
        )?;
        let format = recording.format();
        add_system_audio_track(
            tracks,
            system_audio_source_id()?,
            format.sample_rate,
            format.channels,
        );
        add_segment(tracks, TrackKind::SystemAudio, generation, "wav", start_ns)?;
        recording.start()?;
        self.system_audio = Some(recording);
        Ok(())
    }

    fn open_screen(
        &mut self,
        request: &CaptureRequest,
        layout: &crate::storage::SessionLayout,
        generation: u32,
        start_ns: u64,
        tracks: &mut Vec<TrackMetadata>,
        start_gate: &Arc<super::StartGate>,
    ) -> Result<(), CaptureError> {
        let Some(selection) = &request.screen else {
            return Ok(());
        };
        let path = segment_path(layout, TrackKind::Screen, generation, "mp4");
        let cursor_directory = matches!(request.cursor, CursorSelection::Separate { .. })
            .then(|| layout.track_dir(TrackKind::Cursor));
        let mut recording =
            crate::screen::ScreenRecording::open(crate::screen::ScreenOpenRequest {
                selection,
                recording: &request.recording,
                region: request.region,
                cursor: request.cursor,
                start_ns,
                start_gate: start_gate.clone(),
                consumer: crate::screen::ScreenConsumer::EncodedFile {
                    path,
                    cursor_directory,
                },
            })?;
        if let ScreenSelection::Portal { kind, .. } = selection {
            let format = recording.video_format().ok_or_else(|| {
                CaptureError::Backend("Linux screen format was not negotiated".into())
            })?;
            add_portal_screen_track(
                tracks,
                portal_source_id(kind)?,
                recording
                    .encoded_codec()
                    .ok_or_else(|| CaptureError::Backend("Linux encoder was not selected".into()))?
                    .into(),
                format.width,
                format.height,
                request.recording.target_fps,
            );
            if matches!(request.cursor, CursorSelection::Separate { .. })
                && let Some(track) = track_mut(tracks, TrackKind::Cursor)
                && track.segments.is_empty()
            {
                track.segments.push(crate::storage::segment(
                    "cursor/cursor.json".into(),
                    start_ns,
                ));
                track.status = TrackStatus::Recording;
            }
        }
        add_segment(tracks, TrackKind::Screen, generation, "mp4", start_ns)?;
        recording.start()?;
        self.screen = Some(recording);
        Ok(())
    }

    #[cfg(target_os = "linux")]
    pub(super) fn pause_portal(
        &mut self,
        tracks: &mut [TrackMetadata],
        end_ns: u64,
    ) -> Result<(), CaptureError> {
        if let Some(reporter) = self.reporter.take() {
            reporter.stop()?;
        }
        let recording = self
            .screen
            .as_mut()
            .ok_or_else(|| CaptureError::InvalidTransition {
                from: "RecordingWithoutScreen".into(),
                to: "Paused".into(),
            })?;
        let result = recording.pause();
        mark_track_failed(tracks, TrackKind::Screen, &result);
        result?;
        let screen = track_mut(tracks, TrackKind::Screen)
            .ok_or_else(|| CaptureError::Backend("missing screen track metadata".into()))?;
        let segment = screen
            .segments
            .last_mut()
            .ok_or_else(|| CaptureError::Backend("missing active screen segment".into()))?;
        finish_segment(segment, end_ns)?;
        screen.status = TrackStatus::Paused;
        if let Some(cursor) = track_mut(tracks, TrackKind::Cursor) {
            cursor.status = TrackStatus::Paused;
        }
        if let Some(system_audio) = self.system_audio.as_mut() {
            let result = system_audio.pause();
            mark_track_failed(tracks, TrackKind::SystemAudio, &result);
            result?;
            let track = track_mut(tracks, TrackKind::SystemAudio).ok_or_else(|| {
                CaptureError::Backend("missing system audio track metadata".into())
            })?;
            let segment = track
                .segments
                .last_mut()
                .ok_or_else(|| CaptureError::Backend("missing system audio segment".into()))?;
            finish_segment(segment, end_ns)?;
            track.status = TrackStatus::Paused;
        }
        Ok(())
    }

    #[cfg(target_os = "linux")]
    pub(super) fn resume_portal(&mut self, context: OpenContext<'_>) -> Result<(), CaptureError> {
        let OpenContext {
            request,
            snapshot,
            layout,
            generation,
            start_ns,
            tracks,
            start_gate,
        } = context;
        let path = segment_path(layout, TrackKind::Screen, generation, "mp4");
        self.screen
            .as_mut()
            .ok_or_else(|| CaptureError::InvalidTransition {
                from: "PausedWithoutScreen".into(),
                to: "Recording".into(),
            })?
            .resume(
                start_ns,
                start_gate.clone(),
                Some(crate::screen::ScreenSegment { path, start_ns }),
            )?;
        add_segment(tracks, TrackKind::Screen, generation, "mp4", start_ns)?;
        if let Some(system_audio) = self.system_audio.as_mut() {
            let path = segment_path(layout, TrackKind::SystemAudio, generation, "wav");
            system_audio.resume(
                crate::system_audio::SystemAudioSegment { path, start_ns },
                start_gate.clone(),
            )?;
            add_segment(tracks, TrackKind::SystemAudio, generation, "wav", start_ns)?;
        }
        if let Some(cursor) = track_mut(tracks, TrackKind::Cursor) {
            cursor.status = TrackStatus::Recording;
        }
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
        if let Some(recording) = self.screen.take() {
            let metrics = recording.metrics();
            let mut recording = recording;
            let result = recording.stop();
            #[cfg(target_os = "linux")]
            if let Some(format) = recording.video_format() {
                update_video_format(tracks, TrackKind::Screen, format);
            }
            mark_track_failed(tracks, TrackKind::Screen, &result);
            record_result(result, &mut first_error);
            update_video_metrics(
                tracks,
                TrackKind::Screen,
                metrics.frames_received(),
                metrics.frames_dropped(),
            );
            #[cfg(target_os = "linux")]
            if let Some(track) = track_mut(tracks, TrackKind::Cursor) {
                track.metrics.frames_received = metrics.cursor_samples();
                track.metrics.interruptions = metrics.frames_dropped();
            }
        }
        if let Some(mut recording) = self.system_audio.take() {
            let metrics = recording.metrics();
            let result = recording.stop();
            mark_track_failed(tracks, TrackKind::SystemAudio, &result);
            record_result(result, &mut first_error);
            if let Some(track) = track_mut(tracks, TrackKind::SystemAudio) {
                track.metrics.samples_received = metrics.samples_received();
                track.metrics.samples_dropped = metrics.samples_dropped();
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
        for track in tracks.iter_mut().filter(|track| {
            matches!(track.status, TrackStatus::Recording | TrackStatus::Paused)
                && track
                    .segments
                    .last()
                    .is_some_and(|segment| !segment.complete)
        }) {
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

fn mark_track_failed(
    tracks: &mut [TrackMetadata],
    kind: TrackKind,
    result: &Result<(), CaptureError>,
) {
    let Err(error) = result else { return };
    if let Some(track) = track_mut(tracks, kind) {
        track.status = TrackStatus::Failed;
        track.termination_reason = Some(error.to_string());
    }
}
