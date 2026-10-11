use crate::model::TrackMetadata;
use crate::model::{TrackKind, TrackMetrics};

use super::ActiveRecordings;
use crate::session::periodic_reporter::MetricSampler;
use crate::session::recording_support::track_for;

pub(super) fn samplers(
    recordings: &ActiveRecordings,
    tracks: &[TrackMetadata],
) -> Vec<MetricSampler> {
    #[allow(unused_mut)]
    let mut samplers = Vec::new();
    if let Some(recording) = &recordings.screen
        && let Some(track) = track_for(tracks, TrackKind::Screen)
    {
        let metrics = recording.metrics();
        samplers.push(MetricSampler::new(
            track.track_id,
            track.format.clone(),
            track.metrics.clone(),
            move || TrackMetrics {
                #[cfg(not(windows))]
                frames_acquired: metrics.frames_received(),
                #[cfg(windows)]
                frames_acquired: metrics.frames_acquired(),
                #[cfg(not(windows))]
                frames_encoded: metrics.frames_received(),
                #[cfg(windows)]
                frames_submitted: metrics.frames_submitted(),
                #[cfg(windows)]
                frames_processed: metrics.frames_processed(),
                frames_received: metrics.frames_received(),
                frames_dropped: metrics.frames_dropped(),
                ..TrackMetrics::default()
            },
        ));
    }
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
