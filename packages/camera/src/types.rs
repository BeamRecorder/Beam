use std::sync::Arc;

use crate::{CameraError, color::convert_to_rgba};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PixelFormat {
    Yuyv,
    Nv12,
    Bgra,
    Mjpeg,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CameraDevice {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CameraRequest {
    pub device_id: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CameraFormat {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub pixel_format: PixelFormat,
    pub stride: u32,
}

#[derive(Debug, Clone)]
pub struct CameraFrame {
    pub format: CameraFormat,
    pub native_timestamp_ns: Option<u64>,
    pub sequence: u64,
    pub data: Arc<[u8]>,
}

impl CameraFrame {
    pub fn to_rgba(&self) -> Result<Vec<u8>, CameraError> {
        let mut output = Vec::new();
        self.write_rgba(&mut output)?;
        Ok(output)
    }

    pub fn write_rgba(&self, output: &mut Vec<u8>) -> Result<(), CameraError> {
        convert_to_rgba(self.format, &self.data, output)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CameraQueueLimits {
    pub frames: usize,
    pub bytes: usize,
}

impl Default for CameraQueueLimits {
    fn default() -> Self {
        Self {
            frames: 8,
            bytes: 64 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CameraEvent {
    Started,
    Dropped { sequence: u64 },
    ClockDiscontinuity { sequence: u64 },
    Disconnected(String),
    Failed(String),
}
