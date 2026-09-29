use beam_editor_domain::timeline::range;
use uuid::Uuid;

#[test]
fn ripple_delete_closes_selected_track_gap_without_moving_other_tracks() {
    let mut project = crate::fixtures::project();
    let asset = project.assets[0].id;
    let video = project.tracks.headers().next().unwrap().id;
    let other_track =
        beam_editor_domain::Track::new("Other video".into(), beam_editor_domain::TrackKind::Video);
    let other = other_track.id;
    project.tracks.try_push(other_track).unwrap();
    let mut other_clip = (*crate::fixtures::clip(&project, 0)).clone();
    other_clip.id = Uuid::new_v4();
    other_clip.track_id = other;
    other_clip.start_ms = 0;
    project.clips.try_push(other_clip).unwrap();
    let mut following = (*crate::fixtures::clip(&project, 0)).clone();
    following.id = Uuid::new_v4();
    following.start_ms = 10_000;
    project.clips.try_push(following).unwrap();
    range::ripple_delete(&mut project, 2_000, 5_000, &[video]).unwrap();
    assert_eq!(project.clips.len(), 4);
    assert!(
        project
            .clips
            .headers()
            .any(|clip| clip.track_id == video && clip.start_ms == 7_000)
    );
    assert!(
        project
            .clips
            .headers()
            .any(|clip| clip.track_id == other && clip.start_ms == 0)
    );
    assert_eq!(
        project
            .clips
            .headers()
            .find(|clip| clip.track_id == video)
            .unwrap()
            .asset_id,
        asset
    );
}

#[test]
fn ripple_delete_splits_crossing_clips_with_new_ids_and_rejects_invalid_ranges() {
    let project = crate::fixtures::project();
    let track = project.tracks.headers().next().unwrap().id;
    let original_id = crate::fixtures::clip(&project, 0).id;
    let mut crossing = (*crate::fixtures::clip(&project, 0)).clone();
    crossing.duration_ms = 10_000;
    let mut project = project;
    *crate::fixtures::clip_mut(&mut project, 0) = crossing;
    range::ripple_delete(&mut project, 4_000, 6_000, &[track]).unwrap();
    assert_eq!(project.clips.len(), 2);
    assert_eq!(crate::fixtures::clip(&project, 0).id, original_id);
    assert_eq!(crate::fixtures::clip(&project, 1).start_ms, 4_000);
    assert_ne!(crate::fixtures::clip(&project, 1).id, original_id);
    assert_eq!(crate::fixtures::clip(&project, 1).source_in_ms, 6_000);
    let before = project.clone();
    assert!(range::ripple_delete(&mut project, 7, 7, &[track]).is_err());
    assert!(range::ripple_delete(&mut project, 1, 2, &[Uuid::new_v4()]).is_err());
    assert_eq!(project.clips, before.clips);
}

#[test]
fn ripple_copy_window_preserves_effect_data_and_gives_copied_instances_fresh_ids() {
    let mut project = crate::fixtures::project();
    let definition = project
        .definitions
        .iter()
        .find(|d| d.id == "beam.opacity")
        .unwrap();
    let mut instance = definition.instantiate();
    instance.range = None;
    crate::fixtures::clip_mut(&mut project, 0)
        .instances
        .push(instance.clone());
    let copied = range::window(&crate::fixtures::clip(&project, 0), 1_000, 5_000, true).unwrap();
    assert_ne!(copied.id, crate::fixtures::clip(&project, 0).id);
    assert_ne!(copied.instances[0].id, instance.id);
    assert_eq!(copied.source_in_ms, 1_000);
    assert_eq!(copied.duration_ms, 4_000);
    assert!(range::window(&crate::fixtures::clip(&project, 0), 0, 0, false).is_err());
}
