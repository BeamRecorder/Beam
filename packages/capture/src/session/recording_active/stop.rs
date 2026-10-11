use super::super::{recording_active::ActiveRecordings, recording_support::*};
use crate::{
    CaptureError,
    model::{TrackKind, TrackMetadata, TrackStatus},
    storage::finish_segment,
};
impl ActiveRecordings {
    pub(in crate::session) fn stop(
        &mut self,
        tracks: &mut [TrackMetadata],
        end_ns: u64,
    ) -> Result<(), CaptureError> {
        // Freeze producers together before waiting for any slow finalizer.
        #[cfg(windows)]
        if let Some(screen) = self.screen.as_mut() {
            screen.request_stop();
        }
        #[cfg(all(any(windows, target_os = "macos"), feature = "cursor"))]
        if let Some(cursor) = &self.cursor {
            cursor.request_stop();
        }
        #[allow(unused_mut)]
        let mut first_error = None;
        #[cfg(test)]
        if let Some(reason) = self.test_stop_failure.take() {
            first_error = Some(CaptureError::Backend(reason));
            self.test_screen_availability = None;
        }
        if let Some(reporter) = self.reporter.take() {
            record_result(reporter.stop(), &mut first_error);
        }
        if let Some(recording) = self.screen.take() {
            let metrics = recording.metrics();
            let mut recording = recording;
            let result = recording.stop();
            #[cfg(any(windows, target_os = "linux"))]
            if let Some(format) = recording.video_format() {
                update_video_format(tracks, TrackKind::Screen, format);
            }
            mark_track_failed(tracks, TrackKind::Screen, &result);
            #[cfg(windows)]
            let finalized = recording.output_finalized();
            #[cfg(windows)]
            if finalized
                && result.is_err()
                && let Some(track) = track_mut(tracks, TrackKind::Screen)
            {
                track.status = TrackStatus::Interrupted;
                if let Some(segment) = track.segments.last_mut() {
                    finish_segment(segment, end_ns)?;
                }
            }
            record_result(result, &mut first_error);
            #[cfg(not(windows))]
            update_video_metrics(
                tracks,
                TrackKind::Screen,
                metrics.frames_received(),
                metrics.frames_dropped(),
            );
            #[cfg(windows)]
            if let Some(track) = track_mut(tracks, TrackKind::Screen) {
                track.metrics.frames_acquired += metrics.frames_acquired();
                track.metrics.frames_submitted += metrics.frames_submitted();
                track.metrics.frames_processed += metrics.frames_processed();
                if finalized {
                    track.metrics.frames_encoded += metrics.frames_submitted();
                }
                track.metrics.frames_received += metrics.frames_received();
                track.metrics.frames_dropped += metrics.frames_dropped();
            }
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
            let result = recording.stop();
            mark_track_failed(tracks, TrackKind::Cursor, &result);
            record_result(result, &mut first_error);
            if let Some(track) = track_mut(tracks, TrackKind::Cursor) {
                track.metrics.frames_received += metrics.events();
                track.metrics.interruptions += metrics.interruptions();
            }
        }
        #[cfg(all(target_os = "macos", feature = "cursor"))]
        if let Some(recording) = self.cursor.take() {
            let metrics = recording.metrics();
            let result = recording.stop();
            mark_track_failed(tracks, TrackKind::Cursor, &result);
            record_result(result, &mut first_error);
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
