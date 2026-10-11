use std::sync::Arc;

mod metrics;
mod source_watches;
mod stop;

use crate::{
    CaptureError,
    catalog::CatalogSnapshot,
    model::{CaptureRequest, CursorSelection, ScreenSelection, TrackMetadata, TrackStatus},
};

use crate::model::TrackKind;

use super::periodic_reporter::PeriodicReporter;
use super::recording_support::*;
#[cfg(target_os = "linux")]
use crate::storage::finish_segment;
use source_watches::source_watches;

#[derive(Default)]
pub(super) struct ActiveRecordings {
    #[cfg(test)]
    test_stop_failure: Option<String>,
    reporter: Option<PeriodicReporter>,
    screen: Option<crate::screen::ScreenRecording>,
    #[cfg(test)]
    test_screen_availability: Option<bool>,
    system_audio: Option<crate::system_audio::SystemAudioRecording>,
    #[cfg(all(windows, feature = "cursor"))]
    cursor: Option<crate::cursor::win::WindowsCursorRecording>,
    #[cfg(all(target_os = "macos", feature = "cursor"))]
    cursor: Option<crate::cursor::mac::MacCursorRecording>,
}

pub(super) struct OpenContext<'a> {
    pub(super) request: &'a CaptureRequest,
    pub(super) region_selection: &'a mut Option<crate::screen::RegionSelection>,
    pub(super) snapshot: &'a CatalogSnapshot,
    pub(super) layout: &'a crate::storage::SessionLayout,
    pub(super) generation: u32,
    pub(super) start_ns: u64,
    pub(super) tracks: &'a mut Vec<TrackMetadata>,
    pub(super) start_gate: &'a Arc<super::StartGate>,
    #[cfg(all(target_os = "macos", feature = "cursor"))]
    pub(super) cursor_shape_source: &'a crate::cursor::mac::MacCursorShapeSource,
}

impl ActiveRecordings {
    pub(super) fn has_screen(&self) -> bool {
        #[cfg(test)]
        if self.test_screen_availability.is_some() {
            return true;
        }
        self.screen.is_some()
    }

    pub(super) fn screen_available(&self) -> bool {
        #[cfg(test)]
        if let Some(available) = self.test_screen_availability {
            return available;
        }
        self.screen
            .as_ref()
            .is_none_or(crate::screen::ScreenRecording::is_available)
    }

    pub(super) fn screen_failure_reason(&self) -> Option<String> {
        self.screen
            .as_ref()
            .and_then(crate::screen::ScreenRecording::failure_reason)
    }

    #[cfg(all(windows, feature = "cursor"))]
    pub(super) fn input_failure_reason(&self) -> Option<String> {
        self.cursor
            .as_ref()
            .and_then(|cursor| cursor.metrics().failure_reason())
    }

    #[cfg(test)]
    pub(super) fn fail_next_stop_for_test(&mut self, reason: &str) {
        self.test_stop_failure = Some(reason.into());
    }

    #[cfg(test)]
    pub(super) fn set_screen_availability_for_test(&mut self, available: bool) {
        self.test_screen_availability = Some(available);
    }

    pub(super) fn system_audio_level(&self) -> Option<f32> {
        self.system_audio
            .as_ref()
            .map(|recording| recording.metrics().take_peak())
    }

    pub(super) fn start(
        &mut self,
        start_gate: &super::StartGate,
        t0_ns: u64,
        session_ns: u64,
    ) -> Result<(), CaptureError> {
        // A static Portal window may only produce one frame on activation.
        // Open the gate first so that frame cannot be discarded as pre-recording data.
        start_gate.release_at(t0_ns, session_ns)?;
        if let Some(screen) = self.screen.as_mut() {
            screen.start()?;
        }
        Ok(())
    }

    pub(super) fn open(&mut self, context: OpenContext<'_>) -> Result<(), CaptureError> {
        let OpenContext {
            request,
            region_selection,
            snapshot,
            layout,
            generation,
            start_ns,
            tracks,
            start_gate,
            #[cfg(all(target_os = "macos", feature = "cursor"))]
            cursor_shape_source,
        } = context;
        self.open_screen(OpenContext {
            request,
            region_selection,
            snapshot,
            layout,
            generation,
            start_ns,
            tracks: &mut *tracks,
            start_gate,
            #[cfg(all(target_os = "macos", feature = "cursor"))]
            cursor_shape_source,
        })?;
        #[cfg(all(windows, feature = "cursor"))]
        if let CursorSelection::Separate {
            capture_clicks,
            capture_shortcuts,
            capture_shape,
        } = request.cursor
        {
            let source = match &request.screen {
                Some(ScreenSelection::Source { source_id }) => {
                    let source = crate::cursor::win::source_context(source_id)?;
                    crate::cursor::win::WindowsCursorSourceContext {
                        region: crate::cursor::crop_region(
                            source.region,
                            request.region.unwrap_or(crate::model::ScreenRegion {
                                x: 0.0,
                                y: 0.0,
                                width: 1.0,
                                height: 1.0,
                            }),
                        )?,
                        display_scale_factor: source.display_scale_factor,
                        window_handle: source.window_handle,
                    }
                }
                _ => crate::cursor::win::WindowsCursorSourceContext {
                    region: crate::cursor::CaptureRegion {
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                    },
                    display_scale_factor: None,
                    window_handle: None,
                },
            };
            self.cursor = Some(crate::cursor::win::WindowsCursorRecording::start(
                &layout.track_dir(TrackKind::Cursor),
                source,
                crate::cursor::win::WindowsCursorRecordingConfig {
                    capture_clicks,
                    capture_shortcuts,
                    capture_shape,
                    segment_start_ns: start_ns,
                    start_gate: start_gate.clone(),
                    screen_metrics: self
                        .screen
                        .as_ref()
                        .map(crate::screen::ScreenRecording::metrics)
                        .unwrap_or_default(),
                },
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
        if matches!(request.cursor, CursorSelection::Separate { .. }) {
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
                request.cursor,
                cursor_shape_source.clone(),
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

    fn open_screen(&mut self, context: OpenContext<'_>) -> Result<(), CaptureError> {
        let OpenContext {
            request,
            layout,
            generation,
            start_ns,
            tracks,
            start_gate,
            region_selection,
            ..
        } = context;
        let Some(selection) = &request.screen else {
            return Ok(());
        };
        let path = segment_path(layout, TrackKind::Screen, generation, "mp4");
        let cursor_directory = matches!(request.cursor, CursorSelection::Separate { .. })
            .then(|| layout.track_dir(TrackKind::Cursor));
        let recording = crate::screen::ScreenRecording::open(crate::screen::ScreenOpenRequest {
            selection,
            region_selection: region_selection.take(),
            recording: &request.recording,
            region: request.region,
            hide_taskbar: request.hide_taskbar,
            hide_desktop_icons: request.hide_desktop_icons,
            cursor: request.cursor,
            show_real_cursor: request.show_real_cursor,
            excluded_window_handles: &request.excluded_window_handles,
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
            region_selection: _,
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
            .prepare_resume(
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
}
