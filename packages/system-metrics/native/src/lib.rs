//! Native GPU counters. Sampling has no capture, window or renderer dependency.
mod types;
pub use types::*;
#[cfg(any(target_os = "linux", test))]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(any(windows, test))]
mod windows;

#[derive(Default)]
pub struct GpuSampler {
    #[cfg(target_os = "linux")]
    backend: linux::Sampler,
    #[cfg(windows)]
    backend: windows::Sampler,
}

impl GpuSampler {
    pub fn sample(&mut self, process_ids: &[u32]) -> GpuSample {
        if process_ids.len() > 16 || process_ids.contains(&0) {
            return GpuSample::unavailable(
                "invalid-request",
                "Expected at most 16 nonzero process IDs",
            );
        }
        #[cfg(any(target_os = "linux", windows))]
        {
            self.backend.sample(process_ids)
        }
        #[cfg(target_os = "macos")]
        {
            macos::sample()
        }
        #[cfg(not(any(target_os = "linux", windows, target_os = "macos")))]
        {
            GpuSample::unavailable(
                "unsupported-platform",
                "No GPU counter backend for this platform",
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_zero_process_identifiers() {
        assert!(
            matches!(GpuSampler::default().sample(&[0]), GpuSample::Unavailable { code, .. } if code == "invalid-request")
        );
    }
    #[test]
    fn rejects_unbounded_process_inventories() {
        assert!(
            matches!(GpuSampler::default().sample(&[1; 17]), GpuSample::Unavailable { code, .. } if code == "invalid-request")
        );
    }
    #[test]
    fn diagnostic_messages_preserve_capability_failures() {
        assert!(
            matches!(GpuSample::unavailable("driver", "counter absent"), GpuSample::Unavailable { version: 1, reason, .. } if reason == "counter absent")
        );
    }
}
