use std::{path::PathBuf, sync::Arc};

use crate::{CaptureError, model::SystemAudioSelection, session::StartGate};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(any(target_os = "linux", test))]
mod wav;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SystemAudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
}

#[derive(Debug)]
pub struct SystemAudioSegment {
    pub path: PathBuf,
    pub start_ns: u64,
}

pub struct SystemAudioOpenRequest {
    pub selection: SystemAudioSelection,
    pub segment: SystemAudioSegment,
    pub start_gate: Arc<StartGate>,
    pub queue_capacity: usize,
}

pub struct SystemAudioRecording {
    #[cfg(target_os = "linux")]
    inner: linux::PipewireSystemAudioRecording,
}

pub struct SystemAudioMonitor {
    #[cfg(target_os = "linux")]
    inner: linux::PipewireSystemAudioRecording,
}

impl SystemAudioMonitor {
    pub fn open(selection: SystemAudioSelection) -> Result<Self, CaptureError> {
        #[cfg(target_os = "linux")]
        {
            linux::PipewireSystemAudioRecording::open_preview(selection).map(|inner| Self { inner })
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = selection;
            Err(CaptureError::Unsupported(
                "native system audio preview is not available on this platform".into(),
            ))
        }
    }

    #[must_use]
    pub fn level(&self) -> f32 {
        #[cfg(target_os = "linux")]
        {
            self.inner.metrics().take_peak()
        }
        #[cfg(not(target_os = "linux"))]
        0.0
    }

    pub fn stop(&mut self) -> Result<(), CaptureError> {
        #[cfg(target_os = "linux")]
        {
            self.inner.stop()
        }
        #[cfg(not(target_os = "linux"))]
        Ok(())
    }
}

impl SystemAudioRecording {
    pub fn open(request: SystemAudioOpenRequest) -> Result<Self, CaptureError> {
        #[cfg(target_os = "linux")]
        {
            linux::PipewireSystemAudioRecording::open(request).map(|inner| Self { inner })
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = request;
            Err(CaptureError::Unsupported(
                "native system audio capture is not available on this platform".into(),
            ))
        }
    }

    pub fn start(&mut self) -> Result<(), CaptureError> {
        #[cfg(target_os = "linux")]
        {
            self.inner.start()
        }
        #[cfg(not(target_os = "linux"))]
        Err(CaptureError::Unsupported(
            "native system audio capture is not available on this platform".into(),
        ))
    }

    pub fn pause(&mut self) -> Result<(), CaptureError> {
        #[cfg(target_os = "linux")]
        {
            self.inner.pause()
        }
        #[cfg(not(target_os = "linux"))]
        Err(CaptureError::Unsupported(
            "native system audio capture is not available on this platform".into(),
        ))
    }

    pub fn resume(
        &mut self,
        segment: SystemAudioSegment,
        start_gate: Arc<StartGate>,
    ) -> Result<(), CaptureError> {
        #[cfg(target_os = "linux")]
        {
            self.inner.resume(segment, start_gate)
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = (segment, start_gate);
            Err(CaptureError::Unsupported(
                "native system audio capture is not available on this platform".into(),
            ))
        }
    }

    #[must_use]
    pub fn format(&self) -> SystemAudioFormat {
        #[cfg(target_os = "linux")]
        {
            self.inner.format()
        }
        #[cfg(not(target_os = "linux"))]
        unreachable!("a native system audio recording cannot be opened on this platform")
    }

    #[must_use]
    pub fn metrics(&self) -> Arc<SystemAudioMetrics> {
        #[cfg(target_os = "linux")]
        {
            self.inner.metrics()
        }
        #[cfg(not(target_os = "linux"))]
        unreachable!("a native system audio recording cannot be opened on this platform")
    }

    pub fn stop(&mut self) -> Result<(), CaptureError> {
        #[cfg(target_os = "linux")]
        {
            self.inner.stop()
        }
        #[cfg(not(target_os = "linux"))]
        Ok(())
    }
}

#[derive(Debug, Default)]
pub struct SystemAudioMetrics {
    samples_received: std::sync::atomic::AtomicU64,
    samples_dropped: std::sync::atomic::AtomicU64,
    peak_bits: std::sync::atomic::AtomicU32,
}

impl SystemAudioMetrics {
    #[must_use]
    pub fn samples_received(&self) -> u64 {
        self.samples_received
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    #[must_use]
    pub fn samples_dropped(&self) -> u64 {
        self.samples_dropped
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    #[cfg(target_os = "linux")]
    fn received(&self, samples: u64) {
        self.samples_received
            .fetch_add(samples, std::sync::atomic::Ordering::Relaxed);
    }

    #[cfg(target_os = "linux")]
    fn dropped(&self, samples: u64) {
        self.samples_dropped
            .fetch_add(samples, std::sync::atomic::Ordering::Relaxed);
    }

    #[cfg(target_os = "linux")]
    fn peak(&self, level: f32) {
        let bits = level.clamp(0.0, 1.0).to_bits();
        self.peak_bits
            .fetch_max(bits, std::sync::atomic::Ordering::Relaxed);
    }

    #[must_use]
    pub fn take_peak(&self) -> f32 {
        f32::from_bits(self.peak_bits.swap(0, std::sync::atomic::Ordering::Relaxed))
    }
}
