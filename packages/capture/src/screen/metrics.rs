#[cfg(any(windows, target_os = "linux"))]
use super::VideoFormat;
#[cfg(any(windows, target_os = "linux"))]
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

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
    #[cfg(windows)]
    frames_acquired: AtomicU64,
    #[cfg(windows)]
    frames_submitted: AtomicU64,
    #[cfg(windows)]
    frames_processed: AtomicU64,
    frames_dropped: AtomicU64,
    cursor_samples: AtomicU64,
    format_changes: AtomicU64,
    last_native_pts_ns: AtomicU64,
    #[cfg(any(windows, target_os = "linux"))]
    first_video_format: Mutex<Option<VideoFormat>>,
}

impl Default for ScreenCaptureMetrics {
    fn default() -> Self {
        Self {
            frames_received: AtomicU64::new(0),
            #[cfg(windows)]
            frames_acquired: AtomicU64::new(0),
            #[cfg(windows)]
            frames_submitted: AtomicU64::new(0),
            #[cfg(windows)]
            frames_processed: AtomicU64::new(0),
            frames_dropped: AtomicU64::new(0),
            cursor_samples: AtomicU64::new(0),
            format_changes: AtomicU64::new(0),
            last_native_pts_ns: AtomicU64::new(Self::NO_NATIVE_PTS),
            #[cfg(any(windows, target_os = "linux"))]
            first_video_format: Mutex::new(None),
        }
    }
}

impl ScreenCaptureMetrics {
    const NO_NATIVE_PTS: u64 = u64::MAX;
    #[cfg(windows)]
    pub(crate) fn acquired_frame(&self) {
        self.frames_acquired.fetch_add(1, Ordering::Relaxed);
    }
    #[cfg(windows)]
    pub(crate) fn submitted_frame(&self) {
        self.frames_submitted.fetch_add(1, Ordering::Relaxed);
    }
    #[cfg(windows)]
    pub(crate) fn processed_frame(&self) {
        self.frames_processed.fetch_add(1, Ordering::Relaxed);
    }
    #[cfg(windows)]
    pub(crate) fn frames_acquired(&self) -> u64 {
        self.frames_acquired.load(Ordering::Relaxed)
    }
    #[cfg(windows)]
    pub(crate) fn frames_submitted(&self) -> u64 {
        self.frames_submitted.load(Ordering::Relaxed)
    }
    #[cfg(windows)]
    pub(crate) fn frames_processed(&self) -> u64 {
        self.frames_processed.load(Ordering::Relaxed)
    }

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

    #[cfg(any(windows, target_os = "linux"))]
    pub(crate) fn observe_video_format(&self, format: VideoFormat) {
        if let Ok(mut first) = self.first_video_format.lock()
            && first.is_none()
        {
            *first = Some(format);
        }
    }

    #[must_use]
    #[cfg(any(windows, target_os = "linux"))]
    pub(crate) fn first_video_format(&self) -> Option<VideoFormat> {
        self.first_video_format
            .lock()
            .ok()
            .and_then(|format| *format)
    }
}
