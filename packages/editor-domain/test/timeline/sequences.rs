use beam_editor_domain::{
    Document, Edit, Project,
    animation::{Binding, Interpolation, Keyframe, Value},
    effects::{Instance, definition},
    timeline::{history, sequences},
    timing::{Time, TimeRange, TimeSpace},
};
use std::collections::HashSet;
use uuid::Uuid;
fn edit(document: &Document, edit: Edit) -> Document {
    history::edited(document, &edit).unwrap()
}

fn animated(
    project: &Project,
    id: &str,
    version: u32,
    parameter: &str,
    space: TimeSpace,
    name: &str,
) -> Instance {
    let mut instance = definition(&project.definitions, id, version)
        .unwrap()
        .instantiate();
    instance.name = Some(name.into());
    instance.range = Some(TimeRange {
        space,
        start: Time::milliseconds(100),
        end: Time::milliseconds(1800),
    });
    instance.parameters.insert(
        parameter.into(),
        Binding::Curve {
            space,
            keys: [(0, 0.25), (1000, 0.75)]
                .into_iter()
                .map(|(time, value)| Keyframe {
                    id: Uuid::new_v4(),
                    time: Time::milliseconds(time),
                    value: Value::Number(value),
                    interpolation: Interpolation::Linear,
                })
                .collect(),
        },
    );
    instance
}

fn scoped_av_document() -> Document {
    let mut project = crate::fixtures::project();
    project.assets[0].has_audio = true;
    project.assets[0].cursor = vec![crate::fixtures::point(1000, 0.4, 0.6, None)].into();
    crate::fixtures::source_identity(&mut project, b"scoped-sequence-source");
    let video_track = project
        .tracks
        .headers()
        .find(|track| track.kind == beam_editor_domain::TrackKind::Video)
        .unwrap()
        .id;
    let audio_track = project
        .tracks
        .headers()
        .find(|track| track.kind == beam_editor_domain::TrackKind::Audio)
        .unwrap()
        .id;
    let first = animated(
        &project,
        "beam.opacity",
        1,
        "opacity",
        TimeSpace::ClipLocal,
        "Clip A",
    );
    let mut second = first.duplicate();
    second.name = Some("Clip B".into());
    second.enabled = false;
    {
        let mut video = crate::fixtures::clip_mut(&mut project, 0);
        video.start_ms = 200;
        video.source_in_ms = 1000;
        video.duration_ms = 2000;
        video.rate = beam_editor_domain::timing::Rate {
            numerator: 3,
            denominator: 2,
        };
        video.animation_offset_ms = 125;
        video.instances = vec![first, second];
    }
    let mut audio = (*crate::fixtures::clip(&project, 0)).clone();
    audio.id = Uuid::new_v4();
    audio.track_id = audio_track;
    audio.instances = vec![animated(
        &project,
        "beam.gain",
        1,
        "volume",
        TimeSpace::ClipLocal,
        "Clip voice",
    )];
    let group = Uuid::new_v4();
    audio.link_group = Some(group);
    crate::fixtures::clip_mut(&mut project, 0).link_group = Some(group);
    project.clips.try_push(audio).unwrap();
    let lane = animated(
        &project,
        "beam.opacity",
        2,
        "opacity",
        TimeSpace::Sequence,
        "Lane A",
    );
    let mut lane_second = lane.duplicate();
    lane_second.name = Some("Lane B".into());
    lane_second.enabled = false;
    project
        .tracks
        .try_by_id_mut(video_track)
        .unwrap()
        .unwrap()
        .instances = vec![lane, lane_second];
    let gain = animated(
        &project,
        "beam.gain",
        2,
        "volume",
        TimeSpace::Sequence,
        "Lane voice",
    );
    project
        .tracks
        .try_by_id_mut(audio_track)
        .unwrap()
        .unwrap()
        .instances = vec![gain];
    let scene = animated(
        &project,
        "beam.opacity",
        2,
        "opacity",
        TimeSpace::Sequence,
        "Scene A",
    );
    let mut scene_second = scene.duplicate();
    scene_second.name = Some("Scene B".into());
    scene_second.enabled = false;
    project.sequence_instances = vec![scene, scene_second];
    Document::new(project)
}

fn independent(original: &[Instance], copied: &[Instance]) {
    assert_eq!(original.len(), copied.len());
    for (old, new) in original.iter().zip(copied) {
        assert_ne!(old.id, new.id);
        assert_eq!(
            (
                &old.definition_id,
                old.definition_version,
                &old.name,
                old.enabled,
                old.range
            ),
            (
                &new.definition_id,
                new.definition_version,
                &new.name,
                new.enabled,
                new.range
            )
        );
        assert_eq!(
            old.parameters.keys().collect::<Vec<_>>(),
            new.parameters.keys().collect::<Vec<_>>()
        );
        for (parameter, binding) in &old.parameters {
            match (binding, &new.parameters[parameter]) {
                (Binding::Constant { value: old }, Binding::Constant { value: new }) => {
                    assert_eq!(old, new)
                }
                (
                    Binding::Curve {
                        space: old_space,
                        keys: old_keys,
                    },
                    Binding::Curve {
                        space: new_space,
                        keys: new_keys,
                    },
                ) => {
                    assert_eq!(old_space, new_space);
                    assert_eq!(old_keys.len(), new_keys.len());
                    for (old, new) in old_keys.iter().zip(new_keys) {
                        assert_ne!(old.id, new.id);
                        assert_eq!(
                            (old.time, &old.value, &old.interpolation),
                            (new.time, &new.value, &new.interpolation)
                        );
                    }
                }
                _ => panic!("duplicated binding type changed"),
            }
        }
    }
}

#[test]
fn duplicated_sequences_remap_lanes_and_linked_media_and_keep_every_scoped_decision_independent() {
    let mut original = scoped_av_document();
    let mut canvas = original.project.canvas.clone();
    canvas.background ^= 1;
    original = edit(&original, Edit::Canvas { canvas });
    let untouched = original.clone();
    let mut copied = edit(
        &original,
        Edit::DuplicateSequence {
            id: original.active_sequence,
            name: "Copy".into(),
        },
    );
    assert_eq!(original, untouched);
    assert!(copied.undo.is_empty() && copied.redo.is_empty());
    assert_eq!(copied.project.assets, original.project.assets);
    assert!(std::sync::Arc::ptr_eq(
        &copied.project.assets[0].cursor,
        &original.project.assets[0].cursor
    ));
    let old_tracks: Vec<_> = original.project.tracks.headers().collect();
    let new_tracks: Vec<_> = copied.project.tracks.headers().collect();
    let old_ids: HashSet<_> = old_tracks.iter().map(|track| track.id).collect();
    let new_ids: HashSet<_> = new_tracks.iter().map(|track| track.id).collect();
    assert!(old_ids.is_disjoint(&new_ids));
    assert_eq!(old_tracks.len(), new_tracks.len());
    for (old, new) in old_tracks.iter().zip(&new_tracks) {
        assert_eq!(
            (&old.name, old.kind, old.muted, old.hidden),
            (&new.name, new.kind, new.muted, new.hidden)
        );
        let old = original.project.tracks.try_by_id(old.id).unwrap().unwrap();
        let new = copied.project.tracks.try_by_id(new.id).unwrap().unwrap();
        independent(&old.instances, &new.instances);
    }
    for index in 0..original.project.clips.len() {
        let old = crate::fixtures::clip(&original.project, index);
        let new = crate::fixtures::clip(&copied.project, index);
        assert_ne!(old.id, new.id);
        assert_eq!(
            (
                old.asset_id,
                old.start_ms,
                old.source_in_ms,
                old.duration_ms,
                old.rate,
                old.animation_offset_ms
            ),
            (
                new.asset_id,
                new.start_ms,
                new.source_in_ms,
                new.duration_ms,
                new.rate,
                new.animation_offset_ms
            )
        );
        let lane = old_tracks
            .iter()
            .position(|lane| lane.id == old.track_id)
            .unwrap();
        assert_eq!(new.track_id, new_tracks[lane].id);
        independent(&old.instances, &new.instances);
    }
    let video = crate::fixtures::clip(&copied.project, 0);
    let audio = crate::fixtures::clip(&copied.project, 1);
    assert_eq!(video.link_group, audio.link_group);
    assert_ne!(
        video.link_group,
        crate::fixtures::clip(&original.project, 0).link_group
    );
    beam_editor_domain::timeline::links::validate(&copied.project).unwrap();
    independent(
        &original.project.sequence_instances,
        &copied.project.sequence_instances,
    );
    let new_video_track = video.track_id;
    copied
        .project
        .tracks
        .try_by_id_mut(new_video_track)
        .unwrap()
        .unwrap()
        .instances[0]
        .name = Some("Edited copy".into());
    copied.project.sequence_instances[0].enabled = false;
    copied.project.sequence_instances.reverse();
    if let Binding::Curve { keys, .. } = crate::fixtures::clip_mut(&mut copied.project, 0).instances
        [0]
    .parameters
    .get_mut("opacity")
    .unwrap()
    {
        keys[0].value = Value::Number(0.9);
    }
    sequences::synchronize(&mut copied);
    let source = copied
        .sequences
        .iter()
        .find(|sequence| sequence.id == original.active_sequence)
        .unwrap();
    assert_eq!(source, &original.sequences[0]);
    assert_eq!(original, untouched);
}

#[test]
fn duplicated_scoped_sequences_reopen_and_project_undo_redo_reuses_their_saved_identities() {
    let command = |document: &Document, operation| {
        beam_editor_domain::commands::prepare(
            document,
            &beam_editor_domain::commands::single(document, operation),
        )
        .unwrap()
        .document
    };
    let original = scoped_av_document();
    let copied = command(
        &original,
        Edit::DuplicateSequence {
            id: original.active_sequence,
            name: "Stored copy".into(),
        },
    );
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("media")).unwrap();
    std::fs::write(
        root.path().join("media/source.webm"),
        b"scoped-sequence-source",
    )
    .unwrap();
    let store = beam_editor_domain::project::store::ProjectStore::lock(root.path()).unwrap();
    store.write(&copied).unwrap();
    drop(store);
    let store = beam_editor_domain::project::store::ProjectStore::lock(root.path()).unwrap();
    let loaded = store.read().unwrap().0;
    assert_eq!(loaded, copied);
    let undone = command(&loaded, Edit::UndoProject {});
    assert_eq!(undone.project.tracks, original.project.tracks);
    assert_eq!(undone.project.clips, original.project.clips);
    assert_eq!(
        undone.project.sequence_instances,
        original.project.sequence_instances
    );
    let redone = command(&undone, Edit::RedoProject {});
    assert_eq!(redone.project.tracks, copied.project.tracks);
    assert_eq!(redone.project.clips, copied.project.clips);
    assert_eq!(
        redone.project.sequence_instances,
        copied.project.sequence_instances
    );
    assert_eq!(redone.active_sequence, copied.active_sequence);
    store.write(&redone).unwrap();
    assert_eq!(store.read().unwrap().0, redone);
}
#[test]
fn timelines_share_sources_but_keep_tracks_clips_canvas_and_history_independent() {
    let first = Document::new(crate::fixtures::project());
    let id = first.active_sequence;
    let changed = edit(
        &first,
        Edit::Remove {
            id: crate::fixtures::clip(&first.project, 0).id,
        },
    );
    let second = edit(
        &changed,
        Edit::AddSequence {
            name: "Second".into(),
        },
    );
    assert_eq!(second.project.assets, first.project.assets);
    assert!(second.project.clips.is_empty());
    assert!(second.undo.is_empty());
    assert_ne!(
        second.project.tracks.headers().next().unwrap().id,
        first.project.tracks.headers().next().unwrap().id
    );
    let second_id = second.active_sequence;
    let second = edit(
        &second,
        Edit::AddTrack {
            name: "Music".into(),
            kind: beam_editor_domain::TrackKind::Audio,
        },
    );
    let restored = edit(&second, Edit::SelectSequence { id });
    assert_eq!(restored.undo, changed.undo);
    assert!(restored.project.clips.is_empty());
    let undone = edit(&restored, Edit::Undo {});
    assert_eq!(undone.project.clips, first.project.clips);
    let second = edit(&undone, Edit::SelectSequence { id: second_id });
    assert_eq!(second.project.tracks.len(), 3);
    assert_eq!(second.undo.len(), 1);
    let back = edit(&second, Edit::SelectSequence { id });
    assert_eq!(back.redo.len(), 1);
}
#[test]
fn sequence_switch_is_atomic_and_does_not_consume_history_or_revision_when_unchanged() {
    let first = Document::new(Project::new("Project".into()));
    assert_eq!(
        edit(
            &first,
            Edit::SelectSequence {
                id: first.active_sequence
            }
        ),
        first
    );
    for operation in [
        Edit::SelectSequence { id: Uuid::new_v4() },
        Edit::RemoveSequence {
            id: first.active_sequence,
        },
        Edit::RenameSequence {
            id: Uuid::new_v4(),
            name: "Valid".into(),
        },
    ] {
        assert!(history::edited(&first, &operation).is_err());
        assert_eq!(first.sequences.len(), 1);
    }
    let second = edit(&first, Edit::AddSequence { name: " B ".into() });
    let renamed = edit(
        &second,
        Edit::RenameSequence {
            id: second.active_sequence,
            name: " C ".into(),
        },
    );
    assert_eq!(renamed.sequences[1].name, "C");
    assert!(renamed.undo.is_empty());
    let removed = edit(
        &renamed,
        Edit::RemoveSequence {
            id: renamed.active_sequence,
        },
    );
    assert_eq!(removed.active_sequence, first.active_sequence);
}
#[test]
fn sequence_limits_names_overflow_and_corrupt_histories_are_rejected() {
    let mut document = Document::new(Project::new("Project".into()));
    for name in ["".into(), "  ".into(), "bad\0name".into(), "x".repeat(129)] {
        assert!(history::edited(&document, &Edit::AddSequence { name }).is_err());
    }
    for index in 1..16 {
        document = edit(
            &document,
            Edit::AddSequence {
                name: format!("{index}"),
            },
        );
    }
    assert!(history::edited(&document, &Edit::AddSequence { name: "17".into() }).is_ok());
    let mut invalid = document.clone();
    invalid.sequences[1].id = invalid.sequences[0].id;
    assert!(sequences::validate(&invalid).is_err());
    invalid = document.clone();
    invalid.active_sequence = Uuid::nil();
    assert!(sequences::validate(&invalid).is_err());
    invalid = document.clone();
    invalid.sequences[0].state.canvas.width = 0;
    assert!(sequences::validate(&invalid).is_err());
    invalid = document.clone();
    invalid.revision = u64::MAX;
    assert!(
        history::edited(
            &invalid,
            &Edit::RenameSequence {
                id: invalid.active_sequence,
                name: "X".into()
            }
        )
        .is_err()
    );
}
#[test]
fn legacy_single_timeline_documents_migrate_and_all_sequences_survive_disk_roundtrip() {
    let root = tempfile::tempdir().unwrap();
    let original = Document::new(crate::fixtures::project());
    let mut legacy = serde_json::to_value(&original).unwrap();
    legacy.as_object_mut().unwrap().remove("sequences");
    legacy.as_object_mut().unwrap().remove("activeSequence");
    let path = root.path().join("legacy.json");
    std::fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
    let migrated = beam_editor_domain::project::store::read_document(&path).unwrap();
    assert_eq!(migrated, original);
    let mut migrated = migrated;
    crate::fixtures::source_identity(&mut migrated.project, b"video");
    let next = edit(
        &migrated,
        Edit::AddSequence {
            name: "Second".into(),
        },
    );
    let store = beam_editor_domain::project::store::ProjectStore::lock(root.path()).unwrap();
    store.write(&next).unwrap();
    assert_eq!(store.read().unwrap().0, next);
}
