use std::{collections::BTreeMap, path::PathBuf};

use crate::{
    CaptureError, NativeCaptureErrorCode,
    cursor::{
        CursorEvent, CursorEventWriter, CursorKind, CursorShapeCatalogEntry, telemetry_from_events,
    },
    model::RecordingSettings,
    screen::{
        CursorSampleState, OwnedScreenSample, PixelFormat, ScreenDiscontinuity, ScreenSampleSink,
        ScreenSegment, VideoFormat,
    },
    storage::write_atomic,
};

use super::ffmpeg_process::FfmpegProcess;
use super::{FfmpegCapabilities, ffmpeg_process::FfmpegProcessConfig};

pub(crate) struct FfmpegScreenSink {
    capabilities: FfmpegCapabilities,
    recording: RecordingSettings,
    current_segment: Option<ScreenSegment>,
    process: Option<FfmpegProcess>,
    format: Option<VideoFormat>,
    cursor: Option<CursorOutput>,
    finished: bool,
}

struct CursorOutput {
    directory: PathBuf,
    partial_writer: Option<CursorEventWriter>,
    events: Vec<CursorEvent>,
    shapes: BTreeMap<String, CursorShapeCatalogEntry>,
    previous_id: Option<String>,
    previous_visibility: Option<bool>,
}

impl FfmpegScreenSink {
    pub(crate) fn new(
        capabilities: FfmpegCapabilities,
        recording: RecordingSettings,
        initial_segment: ScreenSegment,
        cursor_directory: Option<PathBuf>,
    ) -> Result<Self, CaptureError> {
        if initial_segment
            .path
            .extension()
            .and_then(|value| value.to_str())
            != Some("mp4")
        {
            return Err(CaptureError::InvalidConfiguration(
                "Linux FFmpeg screen segments must use the .mp4 extension".into(),
            ));
        }
        Ok(Self {
            capabilities,
            recording,
            current_segment: Some(initial_segment),
            process: None,
            format: None,
            cursor: cursor_directory.map(CursorOutput::new),
            finished: false,
        })
    }

    fn start_process(&mut self) -> Result<(), CaptureError> {
        if self.process.is_some() {
            return Ok(());
        }
        let segment = self.current_segment.as_ref().ok_or_else(|| {
            ffmpeg_error("received a video format without an active screen segment")
        })?;
        let format = self
            .format
            .ok_or_else(|| ffmpeg_error("cannot start FFmpeg before format negotiation"))?;
        self.process = Some(FfmpegProcess::spawn(FfmpegProcessConfig {
            capabilities: &self.capabilities,
            output: &segment.path,
            width: format.width,
            height: format.height,
            fps: self.recording.target_fps,
            bitrate_bps: self.recording.video_bitrate_bps,
            keyframe_interval_seconds: self.recording.keyframe_interval_seconds,
        })?);
        Ok(())
    }

    fn finalize_cursor(&mut self) -> Result<(), CaptureError> {
        let Some(cursor) = self.cursor.as_mut() else {
            return Ok(());
        };
        std::fs::create_dir_all(&cursor.directory)
            .map_err(|error| CaptureError::storage(&cursor.directory, error))?;
        if let Some(writer) = cursor.partial_writer.as_mut() {
            writer.flush()?;
        }
        let events_path = cursor.directory.join("cursor.json");
        let telemetry_path = cursor.directory.join("telemetry.json");
        let shapes_path = cursor.directory.join("shapes.json");
        write_atomic(&events_path, &serde_json::to_vec_pretty(&cursor.events)?)?;
        write_atomic(
            &telemetry_path,
            &serde_json::to_vec_pretty(&telemetry_from_events(&cursor.events))?,
        )?;
        write_atomic(&shapes_path, &serde_json::to_vec_pretty(&cursor.shapes)?)?;
        cursor.partial_writer = None;
        let partial = cursor.directory.join("cursor.partial.jsonl");
        if partial.exists() {
            std::fs::remove_file(&partial)
                .map_err(|error| CaptureError::storage(&partial, error))?;
        }
        Ok(())
    }
}

impl ScreenSampleSink for FfmpegScreenSink {
    fn begin_segment(&mut self, segment: ScreenSegment) -> Result<(), CaptureError> {
        if self.finished {
            return Err(ffmpeg_error("cannot resume a finalized FFmpeg sink"));
        }
        if self.current_segment.is_some() || self.process.is_some() {
            return Err(ffmpeg_error(
                "cannot begin a screen segment before the previous segment is finalized",
            ));
        }
        self.current_segment = Some(segment);
        if self.format.is_some() {
            self.start_process()?;
        }
        Ok(())
    }

    fn format_changed(&mut self, format: VideoFormat) -> Result<(), CaptureError> {
        if format.width == 0
            || format.height == 0
            || format.stride
                < usize::try_from(format.width)
                    .unwrap_or(usize::MAX)
                    .saturating_mul(4)
            || format.pixel_format != PixelFormat::Bgra8
        {
            return Err(ffmpeg_error(format!(
                "unsupported FFmpeg input format {format:?}"
            )));
        }
        if let Some(previous) = self.format {
            if previous != format {
                return Err(CaptureError::native(
                    NativeCaptureErrorCode::PipewireFormatUnsupported,
                    format!(
                        "the screen format changed within the session from {previous:?} to {format:?}"
                    ),
                ));
            }
            return Ok(());
        }
        self.format = Some(format);
        self.start_process()
    }

    fn push(&mut self, sample: OwnedScreenSample) -> Result<(), CaptureError> {
        let actual = VideoFormat {
            width: sample.frame.width,
            height: sample.frame.height,
            stride: sample.frame.stride,
            pixel_format: sample.frame.pixel_format,
        };
        if self.format != Some(actual) {
            self.format_changed(actual)?;
        }
        self.process
            .as_mut()
            .ok_or_else(|| ffmpeg_error("FFmpeg is not running for the active segment"))?
            .write_frame(&sample.frame)?;
        if let Some(cursor) = self.cursor.as_mut() {
            cursor.push_sample(sample.timestamp.session_ns, sample.cursor)?;
        }
        Ok(())
    }

    fn discontinuity(&mut self, event: ScreenDiscontinuity) -> Result<(), CaptureError> {
        if event.lost_frames == 0 {
            return Err(CaptureError::InvalidConfiguration(
                "a screen discontinuity must report at least one lost frame".into(),
            ));
        }
        Ok(())
    }

    fn end_segment(&mut self) -> Result<(), CaptureError> {
        let _segment = self
            .current_segment
            .take()
            .ok_or_else(|| ffmpeg_error("no active FFmpeg segment to finalize"))?;
        self.process
            .take()
            .ok_or_else(|| ffmpeg_error("the active FFmpeg segment received no format"))?
            .finish()
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        if self.finished {
            return Ok(());
        }
        let segment_result = if self.current_segment.is_some() {
            self.end_segment()
        } else {
            Ok(())
        };
        let cursor_result = self.finalize_cursor();
        self.finished = true;
        segment_result.and(cursor_result)
    }
}

impl CursorOutput {
    fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            partial_writer: None,
            events: Vec::new(),
            shapes: BTreeMap::new(),
            previous_id: None,
            previous_visibility: None,
        }
    }

    fn push_sample(
        &mut self,
        session_ns: u64,
        sample: CursorSampleState,
    ) -> Result<(), CaptureError> {
        let CursorSampleState::Known {
            native_cursor_id,
            pixel_x,
            pixel_y,
            normalized_x,
            normalized_y,
            visible,
            hotspot,
        } = sample
        else {
            return Ok(());
        };
        if self.previous_id.as_deref() != Some(&native_cursor_id) {
            if let Some(hotspot) = hotspot {
                self.push(CursorEvent::Shape {
                    session_ns,
                    cursor_id: native_cursor_id.clone(),
                    cursor_kind: CursorKind::Custom,
                    native_cursor_id: native_cursor_id.clone(),
                    hotspot,
                })?;
                self.shapes.insert(
                    native_cursor_id.clone(),
                    CursorShapeCatalogEntry {
                        cursor_kind: CursorKind::Custom,
                        native_cursor_id: native_cursor_id.clone(),
                        hotspot,
                    },
                );
            }
            self.previous_id = Some(native_cursor_id.clone());
        }
        if self.previous_visibility != Some(visible) {
            self.push(CursorEvent::Visibility {
                session_ns,
                visible,
            })?;
            self.previous_visibility = Some(visible);
        }
        self.push(CursorEvent::Move {
            session_ns,
            cursor_id: Some(native_cursor_id),
            pixel_x,
            pixel_y,
            normalized_x,
            normalized_y,
            visible,
        })
    }

    fn push(&mut self, event: CursorEvent) -> Result<(), CaptureError> {
        if self.partial_writer.is_none() {
            std::fs::create_dir_all(&self.directory)
                .map_err(|error| CaptureError::storage(&self.directory, error))?;
            self.partial_writer = Some(CursorEventWriter::open(
                &self.directory.join("cursor.partial.jsonl"),
            )?);
        }
        self.partial_writer
            .as_mut()
            .ok_or_else(|| ffmpeg_error("cursor writer was not initialized"))?
            .push(event.clone())?;
        self.events.push(event);
        Ok(())
    }
}

#[must_use]
pub(crate) fn encoded_video_format(format: VideoFormat) -> VideoFormat {
    let width = format.width.saturating_add(format.width % 2);
    let height = format.height.saturating_add(format.height % 2);
    VideoFormat {
        width,
        height,
        stride: usize::try_from(width)
            .unwrap_or(usize::MAX)
            .saturating_mul(4),
        pixel_format: PixelFormat::Bgra8,
    }
}

fn ffmpeg_error(message: impl Into<String>) -> CaptureError {
    CaptureError::native(NativeCaptureErrorCode::FfmpegFailed, message)
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use std::{fs, os::unix::fs::PermissionsExt, path::PathBuf, sync::Arc};

    use crate::{
        cursor::Hotspot,
        model::RecordingSettings,
        screen::{
            CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
            ScreenSampleSink, ScreenSegment, TimestampSource, VideoFormat,
        },
    };

    use super::{CursorOutput, FfmpegCapabilities, FfmpegScreenSink, encoded_video_format};

    #[test]
    fn encoded_format_pads_odd_dimensions_for_yuv420() {
        let actual = encoded_video_format(VideoFormat {
            width: 1919,
            height: 1079,
            stride: 7_676,
            pixel_format: PixelFormat::Bgra8,
        });
        assert_eq!(
            (actual.width, actual.height, actual.stride),
            (1920, 1080, 7680)
        );
    }

    #[test]
    fn encoded_format_preserves_even_dimensions() {
        let actual = encoded_video_format(VideoFormat {
            width: 1280,
            height: 720,
            stride: 5_120,
            pixel_format: PixelFormat::Bgra8,
        });
        assert_eq!((actual.width, actual.height), (1280, 720));
    }

    #[test]
    fn cursor_samples_keep_native_identity_visibility_and_hotspot() {
        let mut output = CursorOutput::new(PathBuf::from("unused"));
        output.partial_writer = None;
        let sample = CursorSampleState::Known {
            native_cursor_id: "pipewire:stream:7".into(),
            pixel_x: -2,
            pixel_y: 9,
            normalized_x: -0.1,
            normalized_y: 0.5,
            visible: true,
            hotspot: Some(Hotspot { x: 2, y: 3 }),
        };
        let temporary = tempfile::tempdir().expect("temporary cursor directory");
        output.directory = temporary.path().into();
        output.push_sample(42, sample).expect("cursor sample");
        assert_eq!(output.events.len(), 3);
        assert_eq!(output.shapes.len(), 1);
        assert_eq!(output.previous_visibility, Some(true));
    }

    #[test]
    fn unknown_cursor_sample_does_not_invent_events() {
        let temporary = tempfile::tempdir().expect("temporary cursor directory");
        let mut output = CursorOutput::new(temporary.path().into());
        output
            .push_sample(42, CursorSampleState::Unknown)
            .expect("unknown sample");
        assert!(output.events.is_empty());
        assert!(!temporary.path().join("cursor.partial.jsonl").exists());
    }

    #[test]
    fn sink_rotates_atomic_segments_and_finalizes_cursor_sidecars() {
        let temporary = tempfile::tempdir().expect("temporary sink directory");
        let executable = temporary.path().join("ffmpeg-fake");
        fs::write(
            &executable,
            "#!/bin/sh\nfor output do :; done\nwc -c >/dev/null\nprintf 'fake-mp4' > \"$output\"\n",
        )
        .expect("write fake FFmpeg");
        let mut permissions = fs::metadata(&executable)
            .expect("fake FFmpeg metadata")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&executable, permissions).expect("make fake FFmpeg executable");
        let screen = temporary.path().join("screen");
        let cursor = temporary.path().join("cursor");
        let first = screen.join("segment-0001.mp4");
        let second = screen.join("segment-0002.mp4");
        let mut sink = FfmpegScreenSink::new(
            FfmpegCapabilities {
                executable,
                encoder: "libopenh264".into(),
            },
            RecordingSettings {
                minimum_free_bytes: 0,
                target_fps: 30,
                ..RecordingSettings::default()
            },
            ScreenSegment {
                path: first.clone(),
                start_ns: 0,
            },
            Some(cursor.clone()),
        )
        .expect("create FFmpeg sink");
        sink.format_changed(VideoFormat {
            width: 2,
            height: 2,
            stride: 8,
            pixel_format: PixelFormat::Bgra8,
        })
        .expect("announce format");
        sink.push(sample(10)).expect("first sample");
        sink.end_segment().expect("finish first segment");
        sink.begin_segment(ScreenSegment {
            path: second.clone(),
            start_ns: 100,
        })
        .expect("begin second segment");
        sink.push(sample(110)).expect("second sample");
        sink.finish().expect("finalize sink");

        assert_eq!(fs::read(first).expect("first segment"), b"fake-mp4");
        assert_eq!(fs::read(second).expect("second segment"), b"fake-mp4");
        let events: Vec<crate::cursor::CursorEvent> =
            serde_json::from_slice(&fs::read(cursor.join("cursor.json")).expect("cursor events"))
                .expect("parse cursor events");
        assert!(events.len() >= 4);
        assert!(cursor.join("telemetry.json").is_file());
        assert!(cursor.join("shapes.json").is_file());
        assert!(!cursor.join("cursor.partial.jsonl").exists());
    }

    fn sample(session_ns: u64) -> OwnedScreenSample {
        OwnedScreenSample {
            frame: OwnedVideoFrame {
                width: 2,
                height: 2,
                stride: 8,
                pixel_format: PixelFormat::Bgra8,
                pixels: Arc::from(vec![0; 16]),
            },
            timestamp: FrameTimestamp {
                session_ns,
                native_pts_ns: Some(session_ns),
                source: TimestampSource::NativePresentation,
            },
            sequence: session_ns,
            cursor: CursorSampleState::Known {
                native_cursor_id: "pipewire:stream:7".into(),
                pixel_x: 1,
                pixel_y: 1,
                normalized_x: 0.5,
                normalized_y: 0.5,
                visible: true,
                hotspot: Some(Hotspot { x: 0, y: 0 }),
            },
        }
    }
}
