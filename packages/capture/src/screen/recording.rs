use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

#[cfg(target_os = "linux")]
use std::sync::Mutex;

use crate::{
    CaptureError,
    model::{CursorSelection, RecordingSettings, ScreenRegion, ScreenSelection},
    session::StartGate,
};

use super::{ScreenSampleSink, ScreenSegment, VideoFormat};

pub enum ScreenConsumer {
    EncodedFile {
        path: PathBuf,
        cursor_directory: Option<PathBuf>,
    },
    Samples(Box<dyn ScreenSampleSink>),
}

pub struct ScreenOpenRequest<'a> {
    pub selection: &'a ScreenSelection,
    pub recording: &'a RecordingSettings,
    pub region: Option<ScreenRegion>,
    pub cursor: CursorSelection,
    pub start_ns: u64,
    pub start_gate: Arc<StartGate>,
    pub consumer: ScreenConsumer,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ScreenCaptureMetricsSnapshot {
    pub frames_received: u64,
    pub frames_dropped: u64,
    pub cursor_samples: u64,
    pub format_changes: u64,
}

#[derive(Debug)]
pub struct ScreenCaptureMetrics {
    frames_received: AtomicU64,
    frames_dropped: AtomicU64,
    cursor_samples: AtomicU64,
    format_changes: AtomicU64,
    last_native_pts_ns: AtomicU64,
    #[cfg(target_os = "linux")]
    first_video_format: Mutex<Option<VideoFormat>>,
}

impl Default for ScreenCaptureMetrics {
    fn default() -> Self {
        Self {
            frames_received: AtomicU64::new(0),
            frames_dropped: AtomicU64::new(0),
            cursor_samples: AtomicU64::new(0),
            format_changes: AtomicU64::new(0),
            last_native_pts_ns: AtomicU64::new(Self::NO_NATIVE_PTS),
            #[cfg(target_os = "linux")]
            first_video_format: Mutex::new(None),
        }
    }
}

impl ScreenCaptureMetrics {
    const NO_NATIVE_PTS: u64 = u64::MAX;

    #[must_use]
    pub fn frames_received(&self) -> u64 {
        self.frames_received.load(Ordering::Relaxed)
    }

    #[must_use]
    pub fn frames_dropped(&self) -> u64 {
        self.frames_dropped.load(Ordering::Relaxed)
    }

    #[must_use]
    pub fn cursor_samples(&self) -> u64 {
        self.cursor_samples.load(Ordering::Relaxed)
    }

    #[must_use]
    pub fn format_changes(&self) -> u64 {
        self.format_changes.load(Ordering::Relaxed)
    }

    #[must_use]
    pub fn last_native_pts_ns(&self) -> Option<u64> {
        let value = self.last_native_pts_ns.load(Ordering::Relaxed);
        (value != Self::NO_NATIVE_PTS).then_some(value)
    }

    #[must_use]
    pub fn snapshot(&self) -> ScreenCaptureMetricsSnapshot {
        ScreenCaptureMetricsSnapshot {
            frames_received: self.frames_received(),
            frames_dropped: self.frames_dropped(),
            cursor_samples: self.cursor_samples(),
            format_changes: self.format_changes(),
        }
    }

    pub(crate) fn received_frame(&self, native_pts_ns: Option<u64>, has_cursor: bool) {
        self.frames_received.fetch_add(1, Ordering::Relaxed);
        if has_cursor {
            self.cursor_samples.fetch_add(1, Ordering::Relaxed);
        }
        if let Some(pts) = native_pts_ns {
            self.last_native_pts_ns.store(pts, Ordering::Relaxed);
        }
    }

    pub(crate) fn dropped_frames(&self, count: u64) {
        self.frames_dropped.fetch_add(count, Ordering::Relaxed);
    }

    #[cfg(target_os = "linux")]
    pub(crate) fn changed_format(&self) {
        self.format_changes.fetch_add(1, Ordering::Relaxed);
    }

    #[cfg(target_os = "linux")]
    pub(crate) fn observe_video_format(&self, format: VideoFormat) {
        if let Ok(mut first) = self.first_video_format.lock()
            && first.is_none()
        {
            *first = Some(format);
        }
    }

    #[must_use]
    #[cfg(target_os = "linux")]
    pub(crate) fn first_video_format(&self) -> Option<VideoFormat> {
        self.first_video_format
            .lock()
            .ok()
            .and_then(|format| *format)
    }
}

pub struct ScreenRecording {
    backend: PlatformScreenRecording,
}

enum PlatformScreenRecording {
    #[cfg(windows)]
    Windows(super::win::WindowsRecording),
    #[cfg(target_os = "macos")]
    Mac(super::mac::MacRecording),
    #[cfg(target_os = "linux")]
    Linux(super::linux::LinuxRecording),
}

impl ScreenRecording {
    pub fn open(request: ScreenOpenRequest<'_>) -> Result<Self, CaptureError> {
        #[cfg(windows)]
        let backend =
            PlatformScreenRecording::Windows(super::win::WindowsRecording::open(request)?);
        #[cfg(target_os = "macos")]
        let backend = PlatformScreenRecording::Mac(super::mac::MacRecording::open(request)?);
        #[cfg(target_os = "linux")]
        let backend = PlatformScreenRecording::Linux(super::linux::LinuxRecording::open(request)?);
        Ok(Self { backend })
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<ScreenCaptureMetrics> {
        match &self.backend {
            #[cfg(windows)]
            PlatformScreenRecording::Windows(recording) => recording.metrics(),
            #[cfg(target_os = "macos")]
            PlatformScreenRecording::Mac(recording) => recording.metrics(),
            #[cfg(target_os = "linux")]
            PlatformScreenRecording::Linux(recording) => recording.metrics(),
        }
    }

    pub fn start(&mut self) -> Result<(), CaptureError> {
        match &mut self.backend {
            #[cfg(target_os = "linux")]
            PlatformScreenRecording::Linux(recording) => recording.start(),
            #[cfg(any(windows, target_os = "macos"))]
            _ => Ok(()),
        }
    }

    pub fn pause(&mut self) -> Result<(), CaptureError> {
        match &mut self.backend {
            #[cfg(target_os = "linux")]
            PlatformScreenRecording::Linux(recording) => recording.pause(),
            #[cfg(any(windows, target_os = "macos"))]
            _ => Err(CaptureError::Unsupported(
                "the encoded screen backend pauses by closing its segment".into(),
            )),
        }
    }

    pub fn resume(
        &mut self,
        start_ns: u64,
        start_gate: Arc<StartGate>,
        segment: Option<ScreenSegment>,
    ) -> Result<(), CaptureError> {
        match &mut self.backend {
            #[cfg(target_os = "linux")]
            PlatformScreenRecording::Linux(recording) => {
                recording.resume(start_ns, start_gate, segment)
            }
            #[cfg(any(windows, target_os = "macos"))]
            _ => {
                let _ = (start_ns, start_gate, segment);
                Err(CaptureError::Unsupported(
                    "the encoded screen backend resumes with a new segment".into(),
                ))
            }
        }
    }

    #[must_use]
    pub fn video_format(&self) -> Option<VideoFormat> {
        match &self.backend {
            #[cfg(target_os = "linux")]
            PlatformScreenRecording::Linux(recording) => recording.video_format(),
            #[cfg(any(windows, target_os = "macos"))]
            _ => None,
        }
    }

    #[must_use]
    pub fn encoded_codec(&self) -> Option<&str> {
        match &self.backend {
            #[cfg(target_os = "linux")]
            PlatformScreenRecording::Linux(recording) => recording.encoded_codec(),
            #[cfg(any(windows, target_os = "macos"))]
            _ => None,
        }
    }

    pub fn stop(&mut self) -> Result<(), CaptureError> {
        match &mut self.backend {
            #[cfg(windows)]
            PlatformScreenRecording::Windows(recording) => recording.stop(),
            #[cfg(target_os = "macos")]
            PlatformScreenRecording::Mac(recording) => recording.stop().map(|_| ()),
            #[cfg(target_os = "linux")]
            PlatformScreenRecording::Linux(recording) => recording.stop(),
        }
    }

    #[must_use]
    pub fn is_available(&self) -> bool {
        match &self.backend {
            #[cfg(windows)]
            PlatformScreenRecording::Windows(recording) => recording.is_available(),
            #[cfg(target_os = "macos")]
            PlatformScreenRecording::Mac(recording) => recording.is_available(),
            #[cfg(target_os = "linux")]
            PlatformScreenRecording::Linux(recording) => recording.is_available(),
        }
    }
}
