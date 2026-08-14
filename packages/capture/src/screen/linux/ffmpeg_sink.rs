use std::{collections::BTreeMap, path::PathBuf};

use crate::{
    CaptureError, NativeCaptureErrorCode,
    cursor::{
        CursorEvent, CursorEventWriter, CursorShapeCatalogEntry, Hotspot, telemetry_from_events,
    },
    input::{InputEvent, InputEventSidecar, NativeInputEvent},
    model::RecordingSettings,
    screen::{
        CursorSampleState, OwnedScreenSample, PixelFormat, ScreenDiscontinuity, ScreenSampleSink,
        ScreenSegment, VideoFormat,
    },
    storage::write_atomic,
};

use super::ffmpeg_process::FfmpegProcess;
use super::{FfmpegCapabilities, LinuxInputMonitor, ffmpeg_process::FfmpegProcessConfig};

pub(crate) struct FfmpegScreenSink {
    capabilities: FfmpegCapabilities,
    recording: RecordingSettings,
    current_segment: Option<ScreenSegment>,
    process: Option<FfmpegProcess>,
    format: Option<VideoFormat>,
    cursor: Option<CursorOutput>,
    input: Option<InputOutput>,
    finished: bool,
}

struct CursorOutput {
    directory: PathBuf,
    partial_writer: Option<CursorEventWriter>,
    events: Vec<CursorEvent>,
    shapes: BTreeMap<String, CursorShapeCatalogEntry>,
    previous_id: Option<String>,
    previous_visibility: Option<bool>,
    previous_position: Option<(f64, f64)>,
}

struct InputOutput {
    directory: PathBuf,
    monitor: Option<LinuxInputMonitor>,
    anchor: Option<(u64, u64)>,
    events: Vec<InputEvent>,
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
            .map(|directory| InputOutput::new(directory.clone()))
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
            if let InputEvent::MouseButton {
                session_ns,
                button,
                pressed,
            } = event
                && let Some(cursor) = self.cursor.as_mut()
            {
                cursor.push_button(session_ns, button, pressed)?;
            }
        }
        Ok(())
    }

    fn finalize_input(&mut self) -> Result<(), CaptureError> {
        if let Some(monitor) = self.input.as_mut().and_then(|input| input.monitor.as_mut()) {
            monitor.stop();
        }
        self.collect_input(None)?;
        let Some(input) = self.input.as_mut() else {
            return Ok(());
        };
        input.events.sort_by_key(InputEvent::session_ns);
        std::fs::create_dir_all(&input.directory)
            .map_err(|error| CaptureError::storage(&input.directory, error))?;
        write_atomic(
            &input.directory.join("input.json"),
            &serde_json::to_vec_pretty(&InputEventSidecar::new(input.events.clone()))?,
        )
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
        self.push_cursor(sample.timestamp.session_ns, sample.cursor)
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
        if let Some(input) = self.input.as_mut() {
            input.anchor = None;
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
        if let Some(monitor) = self.input.as_mut().and_then(|input| input.monitor.as_mut()) {
            monitor.stop();
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
            previous_position: None,
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
        self.previous_position = Some((normalized_x, normalized_y));
        Ok(())
    }

    fn push_button(
        &mut self,
        session_ns: u64,
        button: u8,
        pressed: bool,
    ) -> Result<(), CaptureError> {
        let Some((normalized_x, normalized_y)) = self.previous_position else {
            return Ok(());
        };
        self.push(CursorEvent::Button {
            session_ns,
            button,
            pressed,
            normalized_x,
            normalized_y,
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

impl InputOutput {
    fn new(directory: PathBuf) -> Result<Option<Self>, CaptureError> {
        let Some(monitor) = LinuxInputMonitor::start()? else {
            return Ok(None);
        };
        Ok(Some(Self {
            directory,
            monitor: Some(monitor),
            anchor: None,
            events: Vec::new(),
        }))
    }

    fn drain(&mut self, first_sample_ns: Option<u64>) -> Result<Vec<InputEvent>, CaptureError> {
        let Some(monitor) = self.monitor.as_ref() else {
            return Ok(Vec::new());
        };
        if self.anchor.is_none() {
            for _ in monitor.drain() {}
            if let Some(session_ns) = first_sample_ns {
                self.anchor = Some((monotonic_ns()?, session_ns));
            }
            return Ok(Vec::new());
        }
        let (native_anchor, session_anchor) = self.anchor.unwrap_or_default();
        let mapped = monitor
            .drain()
            .filter(|event| event.monotonic_ns() >= native_anchor)
            .map(|event| map_input_event(event, native_anchor, session_anchor))
            .collect::<Vec<_>>();
        self.events.extend(mapped.iter().cloned());
        Ok(mapped)
    }
}

fn map_input_event(event: NativeInputEvent, native_anchor: u64, session_anchor: u64) -> InputEvent {
    let session_ns =
        session_anchor.saturating_add(event.monotonic_ns().saturating_sub(native_anchor));
    match event {
        NativeInputEvent::MouseButton {
            button, pressed, ..
        } => InputEvent::MouseButton {
            session_ns,
            button,
            pressed,
        },
        NativeInputEvent::Shortcut {
            pressed,
            modifiers,
            key,
            ..
        } => InputEvent::Shortcut {
            session_ns,
            pressed,
            modifiers,
            key,
        },
    }
}

fn monotonic_ns() -> Result<u64, CaptureError> {
    let mut timestamp = libc::timespec {
        tv_sec: 0,
        tv_nsec: 0,
    };
    // SAFETY: timestamp points to valid writable memory for the duration of the call.
    if unsafe { libc::clock_gettime(libc::CLOCK_MONOTONIC, &raw mut timestamp) } != 0 {
        return Err(CaptureError::Backend(format!(
            "monotonic input clock failed: {}",
            std::io::Error::last_os_error()
        )));
    }
    let seconds = u64::try_from(timestamp.tv_sec).unwrap_or(0);
    let nanoseconds = u64::try_from(timestamp.tv_nsec).unwrap_or(0);
    Ok(seconds
        .saturating_mul(1_000_000_000)
        .saturating_add(nanoseconds))
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
