use std::sync::Arc;

mod metrics;
mod source_watches;

use crate::{
    CaptureError,
    catalog::CatalogSnapshot,
    model::{CaptureRequest, ScreenSelection, TrackMetadata, TrackStatus},
    storage::finish_segment,
};

#[cfg(any(windows, target_os = "macos"))]
use crate::model::{CursorSelection, TrackKind};

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
        #[cfg(all(windows, feature = "cursor"))]
        if let CursorSelection::Separate {
            capture_clicks,
            capture_shape,
        } = request.cursor
        {
            let region = match &request.screen {
                Some(ScreenSelection::Source { source_id }) => {
                    crate::cursor::crop_region(
                        crate::cursor::win::source_region(source_id)?,
                        request.region.unwrap_or(crate::model::ScreenRegion { x: 0.0, y: 0.0, width: 1.0, height: 1.0 }),
                    )?
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
                    crate::cursor::crop_region(
                        crate::cursor::mac::source_region(source_id)?,
                        request.region.unwrap_or(crate::model::ScreenRegion { x: 0.0, y: 0.0, width: 1.0, height: 1.0 }),
                    )?
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
