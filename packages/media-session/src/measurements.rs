use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeasurementPoint {
    pub session_ns: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_ns: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_position: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMeasurements {
    pub points: Vec<MeasurementPoint>,
    pub dropped: u64,
    #[serde(default)]
    pub queue_peaks: QueuePeaks,
    #[serde(default)]
    pub native_clock_discontinuous: bool,
}

impl TrackMeasurements {
    pub fn record(&mut self, point: MeasurementPoint) {
        if self
            .points
            .last()
            .is_some_and(|last| point.session_ns < last.session_ns)
        {
            return;
        }
        let native_transition = self
            .points
            .last()
            .is_some_and(|last| last.native_ns.is_some() != point.native_ns.is_some());
        let record_transition = native_transition && !self.native_clock_discontinuous;
        if native_transition && point.native_ns.is_none() {
            self.native_clock_discontinuous = true;
        }
        let should_record =
            self.points.last().is_none_or(|last| {
                point.session_ns.saturating_sub(last.session_ns) >= 1_000_000_000
            }) || record_transition;
        if should_record {
            // Keep the origin plus one hour of recent one-second samples.
            if self.points.len() == 3601 {
                self.points.remove(1);
            }
            self.points.push(point);
        }
    }

    pub fn has_native_clock_discontinuity(&self) -> bool {
        if self.native_clock_discontinuous {
            return true;
        }
        let mut seen_native = false;
        for point in &self.points {
            if point.native_ns.is_some() {
                seen_native = true;
            } else if seen_native {
                return true;
            }
        }
        false
    }

    pub fn drift_ppm(&self) -> Option<f64> {
        if self.has_native_clock_discontinuity() {
            return None;
        }
        let first = self.points.iter().find(|point| point.native_ns.is_some())?;
        let last = self
            .points
            .iter()
            .rev()
            .find(|point| point.native_ns.is_some())?;
        let native = last.native_ns?.checked_sub(first.native_ns?)?;
        let session = last.session_ns.checked_sub(first.session_ns)?;
        (session > 0).then_some((native as f64 / session as f64 - 1.0) * 1_000_000.0)
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuePeaks {
    pub source_packets: usize,
    pub source_bytes: usize,
    pub encoder_packets: usize,
    pub encoder_bytes: usize,
}

impl QueuePeaks {
    pub fn observe_source(&mut self, packets: usize, bytes: usize) {
        self.source_packets = self.source_packets.max(packets);
        self.source_bytes = self.source_bytes.max(bytes);
    }

    pub fn observe_encoder(&mut self, packets: usize, bytes: usize) {
        self.encoder_packets = self.encoder_packets.max(packets);
        self.encoder_bytes = self.encoder_bytes.max(bytes);
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct SessionMeasurements {
    pub screen: TrackMeasurements,
    pub camera: TrackMeasurements,
    pub microphone: TrackMeasurements,
    pub system_audio: TrackMeasurements,
    pub preview: Option<PreviewMeasurements>,
    pub preview_error: Option<String>,
    pub initial_av_offset_ns: Option<i64>,
    pub process_samples: Vec<ProcessSample>,
    pub probe_loop: ProbeLoopMeasurements,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct ProbeLoopMeasurements {
    pub polls: u64,
    pub poll_max_duration_ns: u64,
    pub resource_samples: u64,
    pub resource_sample_max_duration_ns: u64,
}

impl ProbeLoopMeasurements {
    pub fn record_poll(&mut self, duration_ns: u64) {
        self.polls = self.polls.saturating_add(1);
        self.poll_max_duration_ns = self.poll_max_duration_ns.max(duration_ns);
    }

    pub fn record_resource_sample(&mut self, duration_ns: u64) {
        self.resource_samples = self.resource_samples.saturating_add(1);
        self.resource_sample_max_duration_ns =
            self.resource_sample_max_duration_ns.max(duration_ns);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSample {
    pub session_ns: u64,
    pub process_count: u32,
    pub rss_bytes: u64,
    /// Aggregate CPU use in hundredths of a percent, including child processes.
    pub cpu_percent_x100: u32,
    pub gpu_memory_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_frames_uploaded: Option<u64>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct PreviewMeasurements {
    /// Synthetic delay injected by the probe after each GPU upload.
    pub synthetic_delay_ms: u64,
    pub frames_uploaded: u64,
    pub texture_recreations: u64,
    pub bytes_uploaded: u64,
    pub cpu_color_conversion_bytes: u64,
    pub cpu_padding_copy_count: u64,
    pub cpu_padding_copy_bytes: u64,
    pub rgba_capacity_bytes: usize,
    pub staging_capacity_bytes: usize,
    pub cpu_buffer_reallocations: u64,
    pub cpu_buffer_growth_bytes: u64,
    pub submission_latency_samples: u64,
    pub submission_latency_sum_ns: u64,
    pub submission_latency_max_ns: u64,
}

impl PreviewMeasurements {
    pub fn record_submission_latency(&mut self, latency_ns: u64) {
        self.submission_latency_samples = self.submission_latency_samples.saturating_add(1);
        self.submission_latency_sum_ns = self.submission_latency_sum_ns.saturating_add(latency_ns);
        self.submission_latency_max_ns = self.submission_latency_max_ns.max(latency_ns);
    }

    pub fn mean_submission_latency_ns(&self) -> Option<u64> {
        self.submission_latency_sum_ns
            .checked_div(self.submission_latency_samples)
    }
}
