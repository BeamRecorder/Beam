use crate::{
    CaptureError,
    model::{CursorSelection, ScreenRegion, ScreenSelection},
    screen::{OwnedScreenSample, VideoFormat},
};
use beam_media_core::LatestFrame;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenRequest {
    pub selection: ScreenSelection,
    pub region: Option<ScreenRegion>,
    pub cursor: CursorSelection,
    pub fps: u32,
    #[serde(default)]
    pub excluded_window_handles: Vec<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct ScreenQueueLimits {
    pub frames: usize,
    pub bytes: usize,
}
impl Default for ScreenQueueLimits {
    fn default() -> Self {
        Self {
            frames: 8,
            bytes: 64 * 1024 * 1024,
        }
    }
}

pub type ScreenPreview = Arc<LatestFrame<OwnedScreenSample>>;

pub trait ScreenSource: Send {
    fn format(&self) -> VideoFormat;
    fn source_id(&self) -> &str;
    fn queue_depth(&self) -> (usize, usize);
    fn try_frame(&self) -> Result<Option<OwnedScreenSample>, CaptureError>;
    fn preview_handle(&self) -> ScreenPreview;
    fn dropped_frames(&self) -> u64;
    fn try_cursor(&self) -> Option<(u64, crate::screen::CursorSampleState)>;
    fn halt(&mut self) -> Result<(), CaptureError>;
}
