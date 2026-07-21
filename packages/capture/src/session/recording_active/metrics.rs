use crate::model::{TrackKind, TrackMetadata, TrackMetrics};

use super::ActiveRecordings;
use crate::session::{periodic_reporter::MetricSampler, recording_support::track_for};

pub(super) fn samplers(
    recordings: &ActiveRecordings,
    tracks: &[TrackMetadata],
) -> Vec<MetricSampler> {
    let mut samplers = Vec::new();
    #[cfg(windows)]
    if let Some(recording) = &recordings.screen
        && let Some(track) = track_for(tracks, TrackKind::Screen)
    {
        let metrics = recording.metrics();
        samplers.push(MetricSampler::new(
            track.track_id,
            track.format.clone(),
            track.metrics.clone(),
            move || TrackMetrics {
                frames_acquired: metrics.frames_received(),
                frames_encoded: metrics.frames_received(),
                frames_received: metrics.frames_received(),
                frames_dropped: metrics.frames_dropped(),
                ..TrackMetrics::default()
            },
        ));
    }
    #[cfg(target_os = "macos")]
    if let Some(recording) = &recordings.screen
        && let Some(track) = track_for(tracks, TrackKind::Screen)
    {
        let metrics = recording.metrics();
        samplers.push(MetricSampler::new(
            track.track_id,
            track.format.clone(),
            track.metrics.clone(),
            move || TrackMetrics {
                frames_acquired: metrics.frames_received(),
                frames_encoded: metrics.frames_received(),
                frames_received: metrics.frames_received(),
                frames_dropped: metrics.frames_dropped(),
                ..TrackMetrics::default()
            },
        ));
    }
    #[cfg(feature = "microphone")]
    if let Some(recording) = &recordings.microphone
        && let Some(track) = track_for(tracks, TrackKind::Microphone)
    {
        let metrics = recording.metrics();
        samplers.push(MetricSampler::new(
            track.track_id,
            track.format.clone(),
            track.metrics.clone(),
            move || TrackMetrics {
                samples_received: metrics.samples_received(),
                samples_dropped: metrics.samples_dropped(),
                interruptions: metrics.interruptions(),
                ..TrackMetrics::default()
            },
        ));
    }
    #[cfg(all(windows, feature = "system-audio"))]
    if let Some(recording) = &recordings.system_audio
        && let Some(track) = track_for(tracks, TrackKind::SystemAudio)
    {
        let metrics = recording.metrics();
        samplers.push(MetricSampler::new(
            track.track_id,
            track.format.clone(),
            track.metrics.clone(),
            move || TrackMetrics {
                samples_received: metrics.samples_received(),
                interruptions: metrics.interruptions(),
                ..TrackMetrics::default()
            },
        ));
    }
    #[cfg(all(target_os = "macos", feature = "system-audio"))]
    if let Some(recording) = &recordings.system_audio
        && let Some(track) = track_for(tracks, TrackKind::SystemAudio)
    {
        let metrics = recording.metrics();
        samplers.push(MetricSampler::new(
            track.track_id,
            track.format.clone(),
            track.metrics.clone(),
            move || TrackMetrics {
                samples_received: metrics.samples_received(),
                samples_dropped: metrics.samples_dropped(),
                interruptions: metrics.interruptions(),
                ..TrackMetrics::default()
            },
        ));
    }
    #[cfg(all(windows, feature = "cursor"))]
    if let Some(recording) = &recordings.cursor
        && let Some(track) = track_for(tracks, TrackKind::Cursor)
    {
        let metrics = recording.metrics();
        samplers.push(MetricSampler::new(
            track.track_id,
            track.format.clone(),
            track.metrics.clone(),
            move || TrackMetrics {
                frames_received: metrics.events(),
                interruptions: metrics.interruptions(),
                ..TrackMetrics::default()
            },
        ));
    }
    #[cfg(all(target_os = "macos", feature = "cursor"))]
    if let Some(recording) = &recordings.cursor
        && let Some(track) = track_for(tracks, TrackKind::Cursor)
    {
        let metrics = recording.metrics();
        samplers.push(MetricSampler::new(
            track.track_id,
            track.format.clone(),
            track.metrics.clone(),
            move || TrackMetrics {
                frames_received: metrics.events(),
                interruptions: metrics.interruptions(),
                ..TrackMetrics::default()
            },
        ));
    }
    let _ = (recordings, tracks);
    samplers
}
