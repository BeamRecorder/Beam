use beam_editor_domain::{Edit, Effects, TrackKind, timeline::edit::apply};
use uuid::Uuid;
#[test]
fn split_and_trim_preserve_source_time_without_touching_originals() {
    let original = crate::fixtures::project();
    let id = crate::fixtures::clip(&original, 0).id;
    let split = apply(&original, &Edit::Split { id, time_ms: 4000 }).unwrap();
    assert_eq!(crate::fixtures::clip(&original, 0).duration_ms, 10_000);
    assert_eq!(crate::fixtures::clip(&split, 1).source_in_ms, 4000);
    assert_eq!(crate::fixtures::clip(&split, 1).duration_ms, 6000);
    let trimmed = apply(
        &split,
        &Edit::Trim {
            id,
            source_in_ms: 1000,
            duration_ms: 2000,
            start_ms: 500,
        },
    )
    .unwrap();
    assert_eq!(trimmed.assets, original.assets);
    assert_eq!(crate::fixtures::clip(&trimmed, 0).source_in_ms, 1000);
}
#[test]
fn exact_split_boundaries_missing_clips_and_overlapping_moves_fail() {
    let original = crate::fixtures::project();
    let id = crate::fixtures::clip(&original, 0).id;
    for time_ms in [0, 10_000, 10_001] {
        assert!(apply(&original, &Edit::Split { id, time_ms }).is_err());
    }
    assert!(apply(&original, &Edit::Remove { id: Uuid::new_v4() }).is_err());
    assert!(
        apply(
            &original,
            &Edit::Insert {
                asset_id: original.assets[0].id,
                track_id: original.tracks.headers().next().unwrap().id,
                start_ms: 9000
            }
        )
        .is_err()
    );
    assert!(
        apply(
            &original,
            &Edit::Move {
                id,
                track_id: original.tracks.headers().nth(1).unwrap().id,
                start_ms: 0
            }
        )
        .is_err()
    );
    assert!(apply(&original, &Edit::Undo {}).is_err());
}
#[test]
fn every_edit_intent_is_validated_before_replacing_the_project() {
    let original = crate::fixtures::project();
    let id = crate::fixtures::clip(&original, 0).id;
    let moved = apply(
        &original,
        &Edit::Move {
            id,
            track_id: original.tracks.headers().next().unwrap().id,
            start_ms: 500,
        },
    )
    .unwrap();
    assert_eq!(moved.duration_ms(), 10_500);
    let effects = Effects {
        brightness: 0.25,
        volume: 0.5,
        ..Effects::default()
    };
    let changed = apply(
        &original,
        &Edit::Effects {
            id,
            effects: effects.clone(),
        },
    )
    .unwrap();
    assert_eq!(crate::fixtures::clip(&changed, 0).effects, effects);
    assert!(apply(&original, &Edit::Rename { name: "  ".into() }).is_err());
    let track = original.tracks.headers().next().unwrap().id;
    let hidden = apply(
        &original,
        &Edit::Track {
            id: track,
            muted: true,
            hidden: true,
        },
    )
    .unwrap();
    assert!(
        hidden.tracks.headers().next().unwrap().hidden
            && hidden.tracks.headers().next().unwrap().muted
    );
    assert_eq!(
        apply(
            &original,
            &Edit::AddTrack {
                name: "Overlay".into(),
                kind: TrackKind::Video
            }
        )
        .unwrap()
        .tracks
        .len(),
        3
    );
    assert!(
        apply(&original, &Edit::Remove { id })
            .unwrap()
            .clips
            .is_empty()
    );
    assert!(
        apply(
            &original,
            &Edit::Effects {
                id,
                effects: Effects {
                    scale: f64::NAN,
                    ..effects
                }
            }
        )
        .is_err()
    );
}

#[test]
fn new_video_lanes_compose_above_existing_clips_and_audio_lanes_append() {
    let original = crate::fixtures::project();
    let video = apply(
        &original,
        &Edit::AddTrack {
            name: "Overlay".into(),
            kind: TrackKind::Video,
        },
    )
    .unwrap();
    assert_eq!(video.tracks.headers().next().unwrap().name, "Overlay");
    assert_eq!(
        video.tracks.headers().nth(1).unwrap().id,
        original.tracks.headers().next().unwrap().id
    );
    assert_eq!(video.clips, original.clips);
    let audio = apply(
        &video,
        &Edit::AddTrack {
            name: "Music".into(),
            kind: TrackKind::Audio,
        },
    )
    .unwrap();
    assert_eq!(audio.tracks.headers().last().unwrap().name, "Music");
    assert_eq!(
        audio
            .tracks
            .headers()
            .take(video.tracks.len())
            .collect::<Vec<_>>(),
        video.tracks.headers().collect::<Vec<_>>()
    );
}
