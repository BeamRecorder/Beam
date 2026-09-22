#![cfg(test)]

use std::sync::atomic::{AtomicU64, Ordering};

use super::*;

#[test]
fn reporter_emits_monotonic_periodic_health_and_timing() -> Result<(), Box<dyn std::error::Error>> {
    let temporary = tempfile::tempdir()?;
    let health = temporary.path().join("health.jsonl");
    let timing = temporary.path().join("timing.jsonl");
    let gate = Arc::new(StartGate::new());
    let frames = Arc::new(AtomicU64::new(0));
    let sampled_frames = frames.clone();
    let reporter = PeriodicReporter::start_with_interval(
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
        Duration::from_millis(20),
    )?;
    gate.release(7)?;
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        let complete_anchors = std::fs::read(&timing)
            .map(|bytes| bytes.iter().filter(|byte| **byte == b'\n').count())
            .unwrap_or(0);
        if complete_anchors >= 2 {
            break;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
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
        display_id: None,
        capabilities: SourceCapabilities::default(),
    };
    let watch = SourceWatch::new(track_id, source.clone());
    let mut states = vec![SourceState::from_source(&source)];
    let snapshot = |sources| CatalogSnapshot {
        generation: 1,
        created_at_utc: String::new(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
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
    let format_changed = detect_source_changes(&[watch], &mut states, &snapshot(vec![changed]), 4);
    assert!(format_changed.iter().any(|event| matches!(
        event,
        HealthEvent::DeviceChanged { detail, .. } if detail.contains("format")
    )));
    Ok(())
}

#[test]
fn native_clock_handles_zero_rates_and_multichannel_audio() {
    let metrics = TrackMetrics {
        frames_received: 7,
        samples_received: 120,
        ..TrackMetrics::default()
    };
    assert_eq!(
        native_clock(
            &TrackFormat::Video {
                codec: "h264".into(),
                width: 1,
                height: 1,
                nominal_fps: 0,
            },
            &metrics,
        ),
        (7, 1)
    );
    assert_eq!(
        native_clock(
            &TrackFormat::Audio {
                sample_format: "f32".into(),
                sample_rate: 48_000,
                channels: 2,
            },
            &metrics,
        ),
        (60, 48_000)
    );
    assert_eq!(
        native_clock(
            &TrackFormat::Audio {
                sample_format: "f32".into(),
                sample_rate: 0,
                channels: 0,
            },
            &metrics,
        ),
        (120, 1)
    );
    assert_eq!(
        native_clock(
            &TrackFormat::Events {
                format: "json".into()
            },
            &metrics
        ),
        (7, 1_000_000_000)
    );
}

#[test]
fn cumulative_metrics_saturate_each_counter_independently() {
    let base = TrackMetrics {
        frames_acquired: u64::MAX,
        frames_encoded: 1,
        frames_received: 2,
        frames_dropped: 3,
        samples_received: 4,
        samples_dropped: 5,
        interruptions: 6,
        configuration_changes: 7,
    };
    let current = TrackMetrics {
        frames_acquired: 1,
        frames_encoded: 2,
        frames_received: 3,
        frames_dropped: 4,
        samples_received: 5,
        samples_dropped: 6,
        interruptions: 7,
        configuration_changes: 8,
    };
    let total = add_metrics(&base, &current);
    assert_eq!(total.frames_acquired, u64::MAX);
    assert_eq!(total.frames_encoded, 3);
    assert_eq!(total.frames_received, 5);
    assert_eq!(total.frames_dropped, 7);
    assert_eq!(total.samples_received, 9);
    assert_eq!(total.samples_dropped, 11);
    assert_eq!(total.interruptions, 13);
    assert_eq!(total.configuration_changes, 15);
}

#[test]
fn cancelled_start_gate_stops_reporter_without_writing_files()
-> Result<(), Box<dyn std::error::Error>> {
    let temporary = tempfile::tempdir()?;
    let health = temporary.path().join("health.jsonl");
    let timing = temporary.path().join("timing.jsonl");
    let gate = Arc::new(StartGate::new());
    let reporter = PeriodicReporter::start_with_interval(
        health.clone(),
        timing.clone(),
        gate.clone(),
        0,
        Vec::new(),
        Vec::new(),
        Duration::from_millis(1),
    )?;
    gate.cancel();
    assert!(reporter.stop().is_err());
    assert!(!health.exists());
    assert!(!timing.exists());
    Ok(())
}

#[test]
fn reporter_returns_storage_error_for_unwritable_report_path()
-> Result<(), Box<dyn std::error::Error>> {
    let temporary = tempfile::tempdir()?;
    let health = temporary.path().join("missing-parent/health.jsonl");
    let timing = temporary.path().join("timing.jsonl");
    let gate = Arc::new(StartGate::new());
    let reporter = PeriodicReporter::start_with_interval(
        health,
        timing,
        gate.clone(),
        0,
        vec![MetricSampler::new(
            TrackId::new(),
            TrackFormat::Events {
                format: "json".into(),
            },
            TrackMetrics::default(),
            TrackMetrics::default,
        )],
        Vec::new(),
        Duration::from_millis(1),
    )?;
    gate.release(0)?;
    let deadline = Instant::now() + Duration::from_secs(1);
    while reporter
        .thread
        .as_ref()
        .is_some_and(|thread| !thread.is_finished())
        && Instant::now() < deadline
    {
        std::thread::sleep(Duration::from_millis(1));
    }
    assert!(reporter.stop().is_err());
    Ok(())
}

#[test]
fn reporter_records_loss_and_interruption_once_per_counter_change()
-> Result<(), Box<dyn std::error::Error>> {
    let temporary = tempfile::tempdir()?;
    let health = temporary.path().join("health.jsonl");
    let timing = temporary.path().join("timing.jsonl");
    let gate = Arc::new(StartGate::new());
    let reporter = PeriodicReporter::start_with_interval(
        health.clone(),
        timing.clone(),
        gate.clone(),
        10,
        vec![MetricSampler::new(
            TrackId::new(),
            TrackFormat::Events {
                format: "json".into(),
            },
            TrackMetrics::default(),
            || TrackMetrics {
                frames_received: 4,
                frames_dropped: 2,
                samples_dropped: 3,
                interruptions: 1,
                ..TrackMetrics::default()
            },
        )],
        Vec::new(),
        Duration::from_millis(2),
    )?;
    gate.release(10)?;
    let deadline = Instant::now() + Duration::from_secs(1);
    while std::fs::read_to_string(&timing)
        .map(|value| value.lines().count() < 2)
        .unwrap_or(true)
        && Instant::now() < deadline
    {
        std::thread::sleep(Duration::from_millis(1));
    }
    reporter.stop()?;
    let events = std::fs::read_to_string(health)?
        .lines()
        .map(serde_json::from_str::<HealthEvent>)
        .collect::<Result<Vec<_>, _>>()?;
    let discontinuities = events
        .iter()
        .filter(|event| matches!(event, HealthEvent::Discontinuity { .. }))
        .collect::<Vec<_>>();
    assert_eq!(discontinuities.len(), 1);
    assert!(matches!(
        discontinuities[0],
        HealthEvent::Discontinuity { lost_units: 5, .. }
    ));
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(event, HealthEvent::Warning { .. }))
            .count(),
        1
    );
    assert!(
        events
            .iter()
            .filter(|event| matches!(event, HealthEvent::TrackHealth { .. }))
            .count()
            >= 2
    );
    Ok(())
}
