#![cfg(test)]
#![allow(clippy::expect_used)]

use std::{
    mem::size_of,
    sync::{Arc, Mutex},
};

use crate::{
    CaptureError, NativeCaptureErrorCode,
    cursor::CursorKind,
    screen::{
        CursorSampleState, FrameTimestamp, OwnedScreenSample, OwnedVideoFrame, PixelFormat,
        ScreenDiscontinuity, ScreenSampleSink, TimestampSource, VideoFormat,
    },
};

use super::*;

fn negotiated(format: NativePixelFormat, width: u32, height: u32) -> NegotiatedFormat {
    NegotiatedFormat::new(width, height, format).expect("valid test format")
}

fn layout(stride: i32, size: usize) -> BufferLayout {
    BufferLayout {
        offset: 0,
        size,
        stride,
        crop: None,
        transform: VideoTransform::None,
    }
}

fn copy_pixel(format: NativePixelFormat, bytes: &[u8]) -> Vec<u8> {
    copy_frame(bytes, negotiated(format, 1, 1), layout(4, 4))
        .expect("pixel should copy")
        .pixels
        .to_vec()
}

#[path = "params.rs"]
mod buffer_params_tests;
#[path = "cursor_state.rs"]
mod cursor_tests;
#[path = "format.rs"]
mod format_tests;
#[path = "geometry.rs"]
mod region_tests;
#[path = "support.rs"]
mod sink_tests;
#[path = "process.rs"]
mod start_tests;
#[path = "timestamp.rs"]
mod timestamp_tests;
