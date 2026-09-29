use super::{
    MediaSession,
    prepare::{ENCODE_LIMITS, failed_track, prepared_track, unavailable_video},
};
use crate::{MeasurementPoint, SessionError, source::SourceFactory};
use beam_media_core::VideoFrame;
use beam_media_encode::{EncodeError, TrackWriter, VideoConfig};
use beam_media_manifest::{SourceId, TrackFormat, TrackKind, TrackStatus};
use beam_screen::{NativeCaptureErrorCode, ScreenRequest};

impl MediaSession {
    pub(super) fn prepare_screen(
        &mut self,
        request: Option<ScreenRequest>,
        sources: &impl SourceFactory,
    ) -> Result<(), SessionError> {
        let Some(request) = request else {
            return Ok(());
        };
        if let Some(region) = request.region {
            region.validate()?;
        }
        let fps = request.fps;
        let telemetry_request = request.clone();
        let source = match sources.open_screen(request, self.clock.clone(), self.gate.clone()) {
            Ok(source) => source,
            Err(
                error @ beam_screen::CaptureError::Native {
                    code: NativeCaptureErrorCode::PortalCancelled,
                    ..
                },
            )
            | Err(error @ beam_screen::CaptureError::Cancelled) => return Err(error.into()),
            Err(error) => {
                self.manifest.tracks.push(failed_track(
                    TrackKind::Screen,
                    None,
                    unavailable_video(),
                    error.to_string(),
                ));
                return Ok(());
            }
        };
        self.manifest.cursor_mode = match telemetry_request.cursor {
            beam_screen::model::CursorSelection::Disabled => {
                beam_media_manifest::CursorMode::Absent
            }
            beam_screen::model::CursorSelection::Embedded => {
                beam_media_manifest::CursorMode::BakedIn
            }
            beam_screen::model::CursorSelection::Separate { .. } => {
                beam_media_manifest::CursorMode::Separated
            }
        };
        let id = SourceId::new(source.source_id())?;
        self.manifest.selected_sources.screen = Some(id.clone());
        let format = source.format();
        let video = VideoConfig {
            width: format.width,
            height: format.height,
            fps,
        };
        match TrackWriter::open_video(
            &self.layout.root().join("screen.webm"),
            video,
            ENCODE_LIMITS,
        ) {
            Ok(writer) => {
                self.screen_telemetry = match beam_screen::ScreenTelemetry::open(
                    &self.layout.root().join("cursor"),
                    &telemetry_request,
                    self.clock.clone(),
                    self.gate.clone(),
                ) {
                    Ok(telemetry) => {
                        if telemetry.is_some() {
                            self.manifest.tracks.push(prepared_track(
                                TrackKind::Cursor,
                                id.clone(),
                                TrackFormat::Events {
                                    format: "beam-cursor-v1".into(),
                                },
                                "cursor/cursor.json",
                            ));
                        }
                        telemetry
                    }
                    Err(error) => {
                        self.manifest.tracks.push(failed_track(
                            TrackKind::Cursor,
                            Some(id.clone()),
                            TrackFormat::Events {
                                format: "beam-cursor-v1".into(),
                            },
                            error.to_string(),
                        ));
                        None
                    }
                };
                let encoding = writer.video_encoding().ok_or_else(|| {
                    crate::SessionError::InvalidConfiguration(
                        "screen writer has no video encoding".into(),
                    )
                })?;
                self.screen = Some(source);
                self.screen_writer = Some(writer);
                self.screen_fps = fps;
                self.manifest.tracks.push(prepared_track(
                    TrackKind::Screen,
                    id,
                    TrackFormat::Video {
                        codec: encoding.codec.into(),
                        width: format.width,
                        height: format.height,
                        nominal_fps: fps,
                    },
                    "screen.webm",
                ));
            }
            Err(error) => self.manifest.tracks.push(failed_track(
                TrackKind::Screen,
                Some(id),
                unavailable_video(),
                error.to_string(),
            )),
        }
        Ok(())
    }

    pub(super) fn drain_screen_limit(&mut self, limit: usize) {
        let session_ns = self.session_ns();
        if let Some(telemetry) = &mut self.screen_telemetry {
            let result = (|| -> Result<(), beam_screen::CaptureError> {
                telemetry.poll(session_ns)?;
                if let Some(source) = &self.screen {
                    for _ in 0..4096 {
                        let Some((timestamp, cursor)) = source.try_cursor() else {
                            break;
                        };
                        telemetry.push(timestamp, cursor)?;
                    }
                }
                Ok(())
            })();
            if let Err(error) = result {
                self.manifest
                    .warnings
                    .push(format!("cursor/input capture failed: {error}"));
                self.mark_track(TrackKind::Cursor, TrackStatus::Failed, error.to_string());
                if let Some(telemetry) = self.screen_telemetry.take() {
                    let _ = telemetry.finish();
                }
            }
        }

        if self.screen_telemetry.is_none()
            && let Some(source) = &self.screen
        {
            for _ in 0..4096 {
                if source.try_cursor().is_none() {
                    break;
                }
            }
        }
        if let Some(source) = &self.screen {
            let dropped = source.dropped_frames();
            let previous = self.measurements.screen.dropped;
            self.measurements.screen.dropped = dropped;
            if let Some(track) = self.track_mut(TrackKind::Screen) {
                track.metrics.frames_dropped += dropped.saturating_sub(previous);
            }
        }
        for _ in 0..limit {
            let Some(source) = &self.screen else {
                break;
            };
            match source.try_frame() {
                Ok(Some(frame)) => self.write_screen(frame),
                Ok(None) => break,
                Err(error) => {
                    self.fail_screen(error.to_string());
                    break;
                }
            }
        }
    }

    fn write_screen(&mut self, sample: beam_screen::screen::OwnedScreenSample) {
        if sample.timestamp.session_ns < self.segment_start_ns {
            return;
        }
        let kind = TrackKind::Screen;
        if let Some(track) = self.track_mut(kind) {
            track.metrics.frames_acquired += 1;
            track.metrics.frames_received += 1;
        }
        self.measurements.screen.record(MeasurementPoint {
            session_ns: sample.timestamp.session_ns,
            native_ns: sample.timestamp.native_pts_ns,
            sample_position: None,
        });
        let rgba = match beam_screen::rgba_pixels(&sample.frame) {
            Ok(rgba) => rgba,
            Err(error) => {
                self.fail_screen(error.to_string());
                return;
            }
        };
        let result = self.screen_writer.as_ref().map(|writer| {
            writer.push_video(
                VideoFrame {
                    captured_ns: sample.timestamp.session_ns - self.segment_start_ns,
                    width: sample.frame.width,
                    height: sample.frame.height,
                    data: rgba,
                },
                1_000_000_000 / u64::from(self.screen_fps.max(1)),
            )
        });
        match result {
            Some(Ok(())) => {
                if let Some(track) = self.track_mut(kind) {
                    track.metrics.frames_encoded += 1;
                }
            }
            Some(Err(EncodeError::QueueFull { .. })) => {
                if let Some(track) = self.track_mut(kind) {
                    track.metrics.frames_dropped += 1;
                }
            }
            Some(Err(error)) => self.fail_screen(error.to_string()),
            None => {}
        }
    }

    fn fail_screen(&mut self, reason: String) {
        self.mark_track(TrackKind::Screen, TrackStatus::Failed, reason);
        self.screen.take();
        self.screen_writer.take();
    }
}
