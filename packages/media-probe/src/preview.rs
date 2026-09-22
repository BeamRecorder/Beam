use std::{
    any::Any,
    io,
    panic::{AssertUnwindSafe, catch_unwind},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use beam_camera::CameraFrame;
use beam_camera_wgpu::{CameraPreview, PreviewError};
use beam_media_core::{LatestFrame, VideoFrame};
use beam_media_session::{PreviewMeasurements, SessionTimeline};

pub struct PreviewWorker {
    stop: Arc<AtomicBool>,
    gpu_memory_bytes: Arc<AtomicU64>,
    frames_uploaded: Arc<AtomicU64>,
    worker: JoinHandle<PreviewOutcome>,
}

const UNKNOWN_GPU_MEMORY: u64 = u64::MAX;

pub struct PreviewOutcome {
    pub measurements: PreviewMeasurements,
    pub error: Option<String>,
}

impl PreviewWorker {
    pub fn start(
        device: wgpu::Device,
        queue: wgpu::Queue,
        source: Arc<LatestFrame<VideoFrame<CameraFrame>>>,
        timeline: SessionTimeline,
        synthetic_delay: Duration,
    ) -> Result<Self, io::Error> {
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let gpu_memory_bytes = Arc::new(AtomicU64::new(UNKNOWN_GPU_MEMORY));
        let thread_gpu_memory = gpu_memory_bytes.clone();
        let frames_uploaded = Arc::new(AtomicU64::new(0));
        let thread_frames_uploaded = frames_uploaded.clone();
        let worker = thread::Builder::new()
            .name("beam-camera-preview".into())
            .spawn(move || {
                let mut preview = CameraPreview::new();
                let mut measurements = PreviewMeasurements {
                    synthetic_delay_ms: u64::try_from(synthetic_delay.as_millis())
                        .unwrap_or(u64::MAX),
                    ..Default::default()
                };
                let mut error = None;
                let mut last_gpu_sample = Instant::now() - Duration::from_secs(1);
                while !thread_stop.load(Ordering::Acquire) {
                    if let Some(frame) = source.take() {
                        let sample_gpu_memory = last_gpu_sample.elapsed() >= Duration::from_secs(1);
                        let gpu_memory = gpu_action(|| {
                            preview.update(&device, &queue, &frame)?;
                            queue.submit([]);
                            device
                                .poll(wgpu::PollType::Poll)
                                .map_err(|error| PreviewError::Gpu(error.to_string()))?;
                            Ok(sample_gpu_memory
                                .then(|| device.generate_allocator_report())
                                .flatten()
                                .map(|report| report.total_allocated_bytes))
                        });
                        let gpu_memory = match gpu_memory {
                            Ok(memory) => memory,
                            Err(failure) => {
                                error = Some(failure.to_string());
                                break;
                            }
                        };
                        if let Some(now_ns) = timeline.now_ns()
                            && let Some(latency_ns) = now_ns.checked_sub(frame.captured_ns)
                        {
                            measurements.record_submission_latency(latency_ns);
                        }
                        if let Some(bytes) = gpu_memory {
                            thread_gpu_memory.store(bytes, Ordering::Release);
                        }
                        thread_frames_uploaded
                            .store(preview.stats().frames_uploaded, Ordering::Release);
                        if sample_gpu_memory {
                            last_gpu_sample = Instant::now();
                        }
                        if !synthetic_delay.is_zero() {
                            thread::sleep(synthetic_delay);
                        }
                    } else {
                        thread::sleep(Duration::from_millis(5));
                    }
                }
                let stats = preview.stats();
                measurements.frames_uploaded = stats.frames_uploaded;
                measurements.texture_recreations = stats.texture_recreations;
                measurements.bytes_uploaded = stats.bytes_uploaded;
                measurements.cpu_color_conversion_bytes = stats.cpu_color_conversion_bytes;
                measurements.cpu_padding_copy_count = stats.cpu_padding_copy_count;
                measurements.cpu_padding_copy_bytes = stats.cpu_padding_copy_bytes;
                measurements.rgba_capacity_bytes = stats.rgba_capacity_bytes;
                measurements.staging_capacity_bytes = stats.staging_capacity_bytes;
                measurements.cpu_buffer_reallocations = stats.cpu_buffer_reallocations;
                measurements.cpu_buffer_growth_bytes = stats.cpu_buffer_growth_bytes;
                PreviewOutcome {
                    measurements,
                    error,
                }
            })?;
        Ok(Self {
            stop,
            gpu_memory_bytes,
            frames_uploaded,
            worker,
        })
    }

    pub fn frames_uploaded(&self) -> u64 {
        self.frames_uploaded.load(Ordering::Acquire)
    }

    pub fn gpu_memory_bytes(&self) -> Option<u64> {
        known_gpu_memory(self.gpu_memory_bytes.load(Ordering::Acquire))
    }

    pub fn stop(self) -> Result<PreviewOutcome, String> {
        self.stop.store(true, Ordering::Release);
        let deadline = Instant::now() + Duration::from_secs(2);
        while !self.worker.is_finished() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        if !self.worker.is_finished() {
            return Err("preview worker did not stop within two seconds".into());
        }
        self.worker
            .join()
            .map_err(|_| "preview worker panicked".to_owned())
    }
}

pub(crate) fn known_gpu_memory(value: u64) -> Option<u64> {
    (value != UNKNOWN_GPU_MEMORY).then_some(value)
}

pub(crate) fn gpu_action<T>(
    action: impl FnOnce() -> Result<T, PreviewError>,
) -> Result<T, PreviewError> {
    catch_unwind(AssertUnwindSafe(action))
        .unwrap_or_else(|payload| Err(PreviewError::Gpu(panic_message(payload.as_ref()))))
}

pub(crate) fn panic_message(payload: &(dyn Any + Send)) -> String {
    payload
        .downcast_ref::<String>()
        .cloned()
        .or_else(|| {
            payload
                .downcast_ref::<&str>()
                .map(|message| (*message).into())
        })
        .unwrap_or_else(|| "GPU operation panicked".into())
}
