use std::sync::atomic::{AtomicU64, Ordering};

use super::*;

#[test]
fn reporter_emits_monotonic_periodic_health_and_timing() -> Result<(), Box<dyn std::error::Error>> {
    let temporary = tempfile::tempdir()?;
    let health = temporary.path().join("health.jsonl");
    let timing = temporary.path().join("timing.jsonl");
    let gate = Arc::new(StartGate::new());
    let sampled_frames = AtomicU64::new(0);
    let (sampled, samples) = crossbeam_channel::unbounded();
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
            move || {
                let frames_received = sampled_frames.fetch_add(1, Ordering::Relaxed);
                let _ = sampled.send(());
                TrackMetrics {
                    frames_received,
                    ..TrackMetrics::default()
                }
            },
        )],
        Vec::new(),
    )?;
    gate.release(7)?;
    samples.recv_timeout(std::time::Duration::from_secs(2))?;
    samples.recv_timeout(std::time::Duration::from_secs(2))?;
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
