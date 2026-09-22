#![cfg(test)]
#![allow(clippy::expect_used)]

use super::{failed_track, prepared_track, select_audio_id, track_audio_format};
use crate::AudioSelection;
use beam_audio::AudioDevice;
use beam_media_encode::AudioConfig;
use beam_media_manifest::{SourceId, TrackFormat, TrackKind, TrackStatus};

#[test]
fn explicit_audio_selection_skips_discovery_and_default_requires_a_default_device() {
    let mut enumerations = 0;
    let explicit = select_audio_id(AudioSelection::Device("microphone:1".into()), || {
        enumerations += 1;
        Ok(Vec::new())
    })
    .expect("selected")
    .expect("device");
    assert_eq!(explicit, "microphone:1");
    assert_eq!(enumerations, 0);
    assert!(
        select_audio_id(AudioSelection::Disabled, || {
            enumerations += 1;
            Ok(Vec::new())
        })
        .is_none()
    );
    assert_eq!(enumerations, 0);
    let chosen = select_audio_id(AudioSelection::Default, || {
        Ok(vec![
            AudioDevice {
                id: "other".into(),
                name: "Other".into(),
                is_default: false,
            },
            AudioDevice {
                id: "default".into(),
                name: "Default".into(),
                is_default: true,
            },
        ])
    })
    .expect("selected")
    .expect("device");
    assert_eq!(chosen, "default");
    assert!(
        select_audio_id(AudioSelection::Default, || Ok(Vec::new()))
            .expect("selected")
            .is_err()
    );
}

#[test]
fn prepared_and_failed_tracks_keep_distinct_media_status_and_files() {
    let source = SourceId::new("microphone:1").expect("source id");
    let format = track_audio_format(AudioConfig {
        sample_rate: 48_000,
        channels: 2,
    });
    assert_eq!(
        format,
        TrackFormat::Audio {
            sample_format: "F32LE".into(),
            sample_rate: 48_000,
            channels: 2
        }
    );
    let ready = prepared_track(
        TrackKind::Microphone,
        source.clone(),
        format.clone(),
        "microphone.wav",
    );
    assert_eq!(ready.status, TrackStatus::Preparing);
    assert_eq!(ready.segments.len(), 1);
    assert!(!ready.segments[0].complete);
    assert_eq!(ready.source_id, Some(source.clone()));

    let failed = failed_track(
        TrackKind::Microphone,
        Some(source),
        format,
        "permission denied".into(),
    );
    assert_eq!(failed.status, TrackStatus::Failed);
    assert!(failed.segments.is_empty());
    assert_eq!(
        failed.termination_reason.as_deref(),
        Some("permission denied")
    );
}
