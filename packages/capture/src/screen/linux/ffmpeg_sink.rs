use std::{collections::BTreeMap, path::PathBuf};

use crate::{
    CaptureError, NativeCaptureErrorCode,
    cursor::{
        CursorEvent, CursorEventWriter, CursorShapeCatalogEntry, Hotspot, telemetry_from_events,
    },
    input::InputEvent,
    model::RecordingSettings,
    screen::{
        CursorSampleState, OwnedScreenSample, PixelFormat, ScreenDiscontinuity, ScreenSampleSink,
        ScreenSegment, VideoFormat,
    },
    storage::write_atomic,
};

use super::ffmpeg_process::FfmpegProcess;
use super::{
    FfmpegCapabilities,
    cursor_buttons::{RecordedButton, materialize_buttons},
    cursor_fusion::{CursorAnchor, CursorFusion, CursorInputEvent, FusedCursorEvent},
    ffmpeg_process::FfmpegProcessConfig,
    input_timeline::{InputTimeline, MappedInputEvent},
};

pub(crate) struct FfmpegScreenSink {
    capabilities: FfmpegCapabilities,
    recording: RecordingSettings,
    current_segment: Option<ScreenSegment>,
    process: Option<FfmpegProcess>,
    format: Option<VideoFormat>,
    cursor: Option<CursorOutput>,
    input: Option<InputTimeline>,
    finished: bool,
}

struct CursorOutput {
    directory: PathBuf,
    partial_writer: Option<CursorEventWriter>,
    events: Vec<CursorEvent>,
    shapes: BTreeMap<String, CursorShapeCatalogEntry>,
    previous_id: Option<String>,
    previous_visibility: Option<bool>,
    fusion: CursorFusion,
    buttons: Vec<RecordedButton>,
}

impl FfmpegScreenSink {
    pub(crate) fn new(
        capabilities: FfmpegCapabilities,
        recording: RecordingSettings,
        initial_segment: ScreenSegment,
        cursor_directory: Option<PathBuf>,
        capture_interactions: bool,
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
        let input = cursor_directory
            .as_ref()
            .filter(|_| capture_interactions)
            .map(|directory| InputTimeline::new(directory.clone()))
            .transpose()?
            .flatten();
        Ok(Self {
            capabilities,
            recording,
            current_segment: Some(initial_segment),
            process: None,
            format: None,
            cursor: cursor_directory.map(CursorOutput::new),
            input,
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
        cursor.finish_fusion()?;
        cursor.materialize_buttons();
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

    fn collect_input(&mut self, first_sample_ns: Option<u64>) -> Result<(), CaptureError> {
        let Some(input) = self.input.as_mut() else {
            return Ok(());
        };
        let events = input.drain(first_sample_ns)?;
        for event in events {
            let Some(cursor) = self.cursor.as_mut() else {
                continue;
            };
            match event {
                MappedInputEvent::Motion {
                    session_ns,
                    delta_x,
                    delta_y,
                } => cursor.push_input(CursorInputEvent {
                    session_ns,
                    delta_x,
                    delta_y,
                }),
                MappedInputEvent::Persistent(InputEvent::MouseButton {
                    session_ns,
                    button,
                    pressed,
                }) => cursor.push_button(RecordedButton {
                    session_ns,
                    button,
                    pressed,
                }),
                MappedInputEvent::Persistent(InputEvent::Shortcut { .. }) => {}
            }
        }
        Ok(())
    }

    fn finalize_input(&mut self) -> Result<(), CaptureError> {
        if let Some(input) = self.input.as_mut() {
            input.stop();
        }
        self.collect_input(None)?;
        let Some(input) = self.input.as_mut() else {
            return Ok(());
        };
        input.finalize()
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
        self.collect_input(Some(sample.timestamp.session_ns))?;
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

    fn push_cursor(
        &mut self,
        session_ns: u64,
        cursor_sample: CursorSampleState,
    ) -> Result<(), CaptureError> {
        self.collect_input(Some(session_ns))?;
        if let Some(cursor) = self.cursor.as_mut() {
            cursor.push_sample(session_ns, cursor_sample)?;
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
        self.collect_input(None)?;
        if let Some(cursor) = self.cursor.as_mut() {
            cursor.finish_fusion()?;
        }
        if let Some(input) = self.input.as_mut() {
            input.reset_anchor();
        }
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
        if let Some(input) = self.input.as_mut() {
            input.stop();
        }
        let segment_result = if self.current_segment.is_some() {
            self.end_segment()
        } else {
            Ok(())
        };
        let input_result = self.finalize_input();
        let cursor_result = self.finalize_cursor();
        self.finished = true;
        segment_result.and(input_result).and(cursor_result)
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
            fusion: CursorFusion::default(),
            buttons: Vec::new(),
        }
    }

    fn push_sample(
        &mut self,
        session_ns: u64,
        sample: CursorSampleState,
    ) -> Result<(), CaptureError> {
        let CursorSampleState::Known {
            native_cursor_id,
            cursor_kind,
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
        let fused = self.fusion.reconcile(CursorAnchor {
            session_ns,
            pixel_x,
            pixel_y,
            normalized_x,
            normalized_y,
        });
        self.push_fused(fused)?;
        if self.previous_id.as_deref() != Some(&native_cursor_id) {
            let hotspot = hotspot.unwrap_or(Hotspot { x: 0, y: 0 });
            self.push(CursorEvent::Shape {
                session_ns,
                cursor_id: native_cursor_id.clone(),
                cursor_kind,
                native_cursor_id: native_cursor_id.clone(),
                hotspot,
            })?;
            self.shapes.insert(
                native_cursor_id.clone(),
                CursorShapeCatalogEntry {
                    cursor_kind,
                    native_cursor_id: native_cursor_id.clone(),
                    hotspot,
                },
            );
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
        })?;
        Ok(())
    }

    fn push_input(&mut self, event: CursorInputEvent) {
        self.fusion.push(event);
    }

    fn push_button(&mut self, button: RecordedButton) {
        self.buttons.push(button);
    }

    fn materialize_buttons(&mut self) {
        materialize_buttons(&mut self.events, std::mem::take(&mut self.buttons));
    }

    fn finish_fusion(&mut self) -> Result<(), CaptureError> {
        let events = self.fusion.finish();
        self.push_fused(events)
    }

    fn push_fused(&mut self, events: Vec<FusedCursorEvent>) -> Result<(), CaptureError> {
        let cursor_id = self.previous_id.clone();
        let visible = self.previous_visibility.unwrap_or(true);
        for event in events {
            self.push(CursorEvent::Move {
                session_ns: event.session_ns,
                cursor_id: cursor_id.clone(),
                pixel_x: event.pixel_x,
                pixel_y: event.pixel_y,
                normalized_x: event.normalized_x,
                normalized_y: event.normalized_y,
                visible,
            })?;
        }
        Ok(())
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
#[path = "ffmpeg_sink_tests.rs"]
mod tests;
