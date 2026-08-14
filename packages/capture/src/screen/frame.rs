use std::{path::PathBuf, sync::Arc};

use serde::{Deserialize, Serialize};

use crate::{CaptureError, cursor::Hotspot};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PixelFormat {
    Bgra8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoFormat {
    pub width: u32,
    pub height: u32,
    pub stride: usize,
    pub pixel_format: PixelFormat,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OwnedVideoFrame {
    pub width: u32,
    pub height: u32,
    pub stride: usize,
    pub pixel_format: PixelFormat,
    pub pixels: Arc<[u8]>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TimestampSource {
    NativePresentation,
    MonotonicArrival,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameTimestamp {
    pub session_ns: u64,
    pub native_pts_ns: Option<u64>,
    pub source: TimestampSource,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CursorSampleState {
    Unknown,
    Known {
        native_cursor_id: String,
        pixel_x: i32,
        pixel_y: i32,
        normalized_x: f64,
        normalized_y: f64,
        visible: bool,
        hotspot: Option<Hotspot>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct OwnedScreenSample {
    pub frame: OwnedVideoFrame,
    pub timestamp: FrameTimestamp,
    pub sequence: u64,
    pub cursor: CursorSampleState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenDiscontinuity {
    pub session_ns: u64,
    pub lost_frames: u64,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScreenSegment {
    pub path: PathBuf,
    pub start_ns: u64,
}

pub trait ScreenSampleSink: Send {
    fn begin_segment(&mut self, segment: ScreenSegment) -> Result<(), CaptureError>;
    fn format_changed(&mut self, format: VideoFormat) -> Result<(), CaptureError>;
    fn push(&mut self, sample: OwnedScreenSample) -> Result<(), CaptureError>;
    fn discontinuity(&mut self, event: ScreenDiscontinuity) -> Result<(), CaptureError>;
    fn end_segment(&mut self) -> Result<(), CaptureError>;
    fn finish(&mut self) -> Result<(), CaptureError>;
}
