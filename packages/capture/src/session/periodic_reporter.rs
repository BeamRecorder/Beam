use std::{path::PathBuf, sync::Arc, thread::JoinHandle, time::Instant};

use crossbeam_channel::{Receiver, RecvTimeoutError, Sender, bounded};

use crate::{
    CaptureError,
    catalog::{CatalogSnapshot, NativeCatalog, SourceCatalog},
    model::{
        HealthEvent, SourceDescriptor, SourceId, TimingAnchor, TrackFormat, TrackId, TrackMetrics,
    },
};

use super::{StartGate, recording_support::append_jsonl};

pub(super) struct MetricSampler {
    track_id: TrackId,
    format: TrackFormat,
    base: TrackMetrics,
    sample: Box<dyn Fn() -> TrackMetrics + Send + Sync>,
}

impl MetricSampler {
    #[allow(dead_code)] // Native Windows/macOS recorders instantiate samplers; Linux has no native recorder.
    pub(super) fn new(
        track_id: TrackId,
        format: TrackFormat,
        base: TrackMetrics,
        sample: impl Fn() -> TrackMetrics + Send + Sync + 'static,
    ) -> Self {
        Self {
            track_id,
            format,
            base,
            sample: Box::new(sample),
        }
    }
}

pub(super) struct PeriodicReporter {
    stop: Option<Sender<()>>,
    thread: Option<JoinHandle<Result<(), CaptureError>>>,
}

#[derive(Debug, Clone)]
pub(super) struct SourceWatch {
    track_id: TrackId,
    source: SourceDescriptor,
}

impl SourceWatch {
    pub(super) const fn new(track_id: TrackId, source: SourceDescriptor) -> Self {
        Self { track_id, source }
    }
}

impl PeriodicReporter {
    pub(super) fn start(
        health_path: PathBuf,
        timing_path: PathBuf,
        start_gate: Arc<StartGate>,
        segment_start_ns: u64,
        samplers: Vec<MetricSampler>,
        source_watches: Vec<SourceWatch>,
    ) -> Result<Self, CaptureError> {
        let (stop, receiver) = bounded(1);
        let thread = std::thread::Builder::new()
            .name("capture-health-reporter".into())
            .spawn(move || {
                start_gate.wait()?;
                report_loop(
                    &health_path,
                    &timing_path,
                    segment_start_ns,
                    &samplers,
                    &source_watches,
                    &receiver,
                )
            })
            .map_err(|error| CaptureError::Backend(error.to_string()))?;
        Ok(Self {
            stop: Some(stop),
            thread: Some(thread),
        })
    }

    pub(super) fn stop(mut self) -> Result<(), CaptureError> {
        self.finish()
    }

    fn finish(&mut self) -> Result<(), CaptureError> {
        self.stop.take();
        if let Some(thread) = self.thread.take() {
            thread
                .join()
                .map_err(|_| CaptureError::Backend("health reporter thread panicked".into()))??;
        }
        Ok(())
    }
}

impl Drop for PeriodicReporter {
    fn drop(&mut self) {
        let _result = self.finish();
    }
}

fn report_loop(
    health_path: &std::path::Path,
    timing_path: &std::path::Path,
    segment_start_ns: u64,
    samplers: &[MetricSampler],
    source_watches: &[SourceWatch],
    stop: &Receiver<()>,
) -> Result<(), CaptureError> {
    let started = Instant::now();
    let mut previous = vec![TrackMetrics::default(); samplers.len()];
    let mut source_state = source_watches
        .iter()
        .map(|watch| SourceState::from_source(&watch.source))
        .collect::<Vec<_>>();
    let catalog = NativeCatalog::default();
    loop {
        match stop.recv_timeout(report_interval()) {
            Ok(()) | Err(RecvTimeoutError::Disconnected) => return Ok(()),
            Err(RecvTimeoutError::Timeout) => {}
        }
        let session_ns = segment_start_ns
            .saturating_add(u64::try_from(started.elapsed().as_nanos()).unwrap_or(u64::MAX));
        for (index, sampler) in samplers.iter().enumerate() {
            let metrics = add_metrics(&sampler.base, &(sampler.sample)());
            append_jsonl(
                health_path,
                &HealthEvent::TrackHealth {
                    track_id: sampler.track_id,
                    session_ns,
                    metrics: metrics.clone(),
                },
            )?;
            let (native_position, native_rate) = native_clock(&sampler.format, &metrics);
            append_jsonl(
                timing_path,
                &TimingAnchor {
                    track_id: sampler.track_id,
                    session_ns,
                    native_position,
                    native_rate,
                },
            )?;
            let lost_units = metrics
                .frames_dropped
                .saturating_sub(previous[index].frames_dropped)
                .saturating_add(
                    metrics
                        .samples_dropped
                        .saturating_sub(previous[index].samples_dropped),
                );
            if lost_units > 0 {
                append_jsonl(
                    health_path,
                    &HealthEvent::Discontinuity {
                        track_id: sampler.track_id,
                        session_ns,
                        lost_units,
                        reason: "bounded queue saturation or native frame loss".into(),
                    },
                )?;
            }
            if metrics.interruptions > previous[index].interruptions {
                append_jsonl(
                    health_path,
                    &HealthEvent::Warning {
                        session_ns,
                        message: format!(
                            "track {} reported {} new interruption(s)",
                            sampler.track_id,
                            metrics
                                .interruptions
                                .saturating_sub(previous[index].interruptions)
                        ),
                    },
                )?;
            }
            previous[index] = metrics;
        }
        if !source_watches.is_empty() {
            match catalog.snapshot() {
                Ok(snapshot) => {
                    for event in detect_source_changes(
                        source_watches,
                        &mut source_state,
                        &snapshot,
                        session_ns,
                    ) {
                        append_jsonl(health_path, &event)?;
                    }
                }
                Err(error) => append_jsonl(
                    health_path,
                    &HealthEvent::Warning {
                        session_ns,
                        message: format!("source monitoring failed: {error}"),
                    },
                )?,
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SourceState {
    present: bool,
    is_default: bool,
    default_id: Option<SourceId>,
    descriptor: SourceDescriptor,
}

impl SourceState {
    fn from_source(source: &SourceDescriptor) -> Self {
        Self {
            present: true,
            is_default: source.is_default,
            default_id: source.is_default.then(|| source.id.clone()),
            descriptor: source.clone(),
        }
    }
}

fn detect_source_changes(
    watches: &[SourceWatch],
    states: &mut [SourceState],
    snapshot: &CatalogSnapshot,
    session_ns: u64,
) -> Vec<HealthEvent> {
    let mut events = Vec::new();
    for (watch, state) in watches.iter().zip(states.iter_mut()) {
        let current = snapshot
            .sources
            .iter()
            .find(|source| source.id == watch.source.id);
        match current {
            None if state.present => {
                events.push(HealthEvent::DeviceChanged {
                    track_id: watch.track_id,
                    session_ns,
                    detail: format!("source disconnected: {}", watch.source.id),
                });
                events.push(HealthEvent::Error {
                    track_id: Some(watch.track_id),
                    session_ns,
                    code: "source-lost".into(),
                    message: format!(
                        "selected source is no longer available: {}",
                        watch.source.id
                    ),
                });
                state.present = false;
            }
            Some(source) => {
                if !state.present {
                    events.push(HealthEvent::DeviceChanged {
                        track_id: watch.track_id,
                        session_ns,
                        detail: format!("source reconnected: {}", watch.source.id),
                    });
                }
                if state.present && source.capabilities != state.descriptor.capabilities {
                    events.push(HealthEvent::DeviceChanged {
                        track_id: watch.track_id,
                        session_ns,
                        detail: format!(
                            "source format or capabilities changed: {}",
                            watch.source.id
                        ),
                    });
                }
                if source.is_default != state.is_default {
                    events.push(HealthEvent::DeviceChanged {
                        track_id: watch.track_id,
                        session_ns,
                        detail: format!("source default status changed: {}", watch.source.id),
                    });
                }
                state.present = true;
                state.is_default = source.is_default;
                state.descriptor = source.clone();
            }
            None => {}
        }
        let current_default = snapshot
            .sources
            .iter()
            .find(|source| source.kind == watch.source.kind && source.is_default)
            .map(|source| source.id.clone());
        if state.default_id != current_default && watch.source.is_default {
            events.push(HealthEvent::DeviceChanged {
                track_id: watch.track_id,
                session_ns,
                detail: format!(
                    "default {:?} source changed from {:?} to {:?}",
                    watch.source.kind, state.default_id, current_default
                ),
            });
        }
        state.default_id = current_default;
    }
    events
}

#[cfg(not(test))]
fn report_interval() -> std::time::Duration {
    std::time::Duration::from_secs(1)
}

#[cfg(test)]
fn report_interval() -> std::time::Duration {
    std::time::Duration::from_millis(20)
}

fn native_clock(format: &TrackFormat, metrics: &TrackMetrics) -> (u64, u64) {
    match format {
        TrackFormat::Video { nominal_fps, .. } => {
            (metrics.frames_received, u64::from((*nominal_fps).max(1)))
        }
        TrackFormat::Audio {
            sample_rate,
            channels,
            ..
        } => {
            let channels = u64::from((*channels).max(1));
            (
                metrics.samples_received / channels,
                u64::from((*sample_rate).max(1)),
            )
        }
        TrackFormat::Events { .. } => (metrics.frames_received, 1_000_000_000),
    }
}

fn add_metrics(base: &TrackMetrics, current: &TrackMetrics) -> TrackMetrics {
    TrackMetrics {
        frames_acquired: base.frames_acquired.saturating_add(current.frames_acquired),
        frames_encoded: base.frames_encoded.saturating_add(current.frames_encoded),
        frames_received: base.frames_received.saturating_add(current.frames_received),
        frames_dropped: base.frames_dropped.saturating_add(current.frames_dropped),
        samples_received: base
            .samples_received
            .saturating_add(current.samples_received),
        samples_dropped: base.samples_dropped.saturating_add(current.samples_dropped),
        interruptions: base.interruptions.saturating_add(current.interruptions),
        configuration_changes: base
            .configuration_changes
            .saturating_add(current.configuration_changes),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    #[test]
    fn reporter_emits_monotonic_periodic_health_and_timing()
    -> Result<(), Box<dyn std::error::Error>> {
        let temporary = tempfile::tempdir()?;
        let health = temporary.path().join("health.jsonl");
        let timing = temporary.path().join("timing.jsonl");
        let gate = Arc::new(StartGate::new());
        let frames = Arc::new(AtomicU64::new(0));
        let sampled_frames = frames.clone();
        let reporter = PeriodicReporter::start(
            health.clone(),
            timing.clone(),
            gate.clone(),
            100,
            vec![MetricSampler::new(
                TrackId::new(),
                TrackFormat::Video {
                    codec: "fake".into(),
                    width: 1,
                    height: 1,
                    nominal_fps: 30,
                },
                TrackMetrics::default(),
                move || TrackMetrics {
                    frames_received: sampled_frames.fetch_add(1, Ordering::Relaxed),
                    ..TrackMetrics::default()
                },
            )],
            Vec::new(),
        )?;
        gate.release(7)?;
        std::thread::sleep(std::time::Duration::from_millis(75));
        reporter.stop()?;

        let anchors = std::fs::read_to_string(timing)?
            .lines()
            .map(serde_json::from_str::<TimingAnchor>)
            .collect::<Result<Vec<_>, _>>()?;
        let events = std::fs::read_to_string(health)?
            .lines()
            .map(serde_json::from_str::<HealthEvent>)
            .collect::<Result<Vec<_>, _>>()?;
        assert!(anchors.len() >= 2);
        assert_eq!(anchors.len(), events.len());
        assert!(
            anchors
                .windows(2)
                .all(|pair| pair[0].session_ns < pair[1].session_ns)
        );
        assert!(
            anchors
                .windows(2)
                .all(|pair| pair[0].native_position < pair[1].native_position)
        );
        Ok(())
    }

    #[test]
    fn source_monitor_reports_disconnect_reconnect_and_format_change()
    -> Result<(), Box<dyn std::error::Error>> {
        use crate::model::{
            CaptureCapabilities, MediaFormat, PermissionSnapshot, SourceCapabilities, SourceKind,
            SourceSelectionMode,
        };

        let track_id = TrackId::new();
        let source = SourceDescriptor {
            id: SourceId::new("display:test")?,
            kind: SourceKind::Display,
            label: "Test display".into(),
            is_default: true,
            selection_mode: SourceSelectionMode::Direct,
            capabilities: SourceCapabilities::default(),
        };
        let watch = SourceWatch::new(track_id, source.clone());
        let mut states = vec![SourceState::from_source(&source)];
        let snapshot = |sources| CatalogSnapshot {
            generation: 1,
            created_at_utc: String::new(),
            capabilities: CaptureCapabilities::default(),
            permissions: PermissionSnapshot::default(),
            limitations: Vec::new(),
            sources,
        };

        let disconnected = detect_source_changes(
            std::slice::from_ref(&watch),
            &mut states,
            &snapshot(vec![]),
            1,
        );
        assert!(matches!(disconnected[0], HealthEvent::DeviceChanged { .. }));
        assert!(disconnected.iter().any(|event| matches!(
            event,
            HealthEvent::Error { code, .. } if code == "source-lost"
        )));
        assert!(
            detect_source_changes(
                std::slice::from_ref(&watch),
                &mut states,
                &snapshot(vec![]),
                2
            )
            .is_empty()
        );

        let mut changed = source.clone();
        changed.capabilities.formats.push(MediaFormat::Video {
            width: 1920,
            height: 1080,
            fps: 30,
            pixel_format: Some("nv12".into()),
        });
        let reconnected = detect_source_changes(
            std::slice::from_ref(&watch),
            &mut states,
            &snapshot(vec![changed.clone()]),
            3,
        );
        assert!(reconnected.iter().any(|event| matches!(
            event,
            HealthEvent::DeviceChanged { detail, .. } if detail.contains("reconnected")
        )));

        changed.capabilities.formats.push(MediaFormat::Video {
            width: 1280,
            height: 720,
            fps: 30,
            pixel_format: Some("nv12".into()),
        });
        let format_changed =
            detect_source_changes(&[watch], &mut states, &snapshot(vec![changed]), 4);
        assert!(format_changed.iter().any(|event| matches!(
            event,
            HealthEvent::DeviceChanged { detail, .. } if detail.contains("format")
        )));
        Ok(())
    }
}
