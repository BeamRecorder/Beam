use beam_editor_domain::{
    Edit, Project,
    project::validation,
    timeline::{edit, links},
};
use uuid::Uuid;
fn linked() -> Project {
    let mut p = crate::fixtures::project();
    p.assets[0].has_audio = true;
    let mut audio = (*crate::fixtures::clip(&p, 0)).clone();
    audio.id = Uuid::new_v4();
    audio.track_id = p.tracks.headers().nth(1).unwrap().id;
    p.clips.try_push(audio).unwrap();
    let ids: Vec<_> = p.clips.headers().map(|c| c.id).collect();
    links::link(&mut p, &ids).unwrap();
    p
}
#[test]
fn linked_move_trim_and_retime_keep_source_and_sequence_alignment() {
    let p = linked();
    let id = crate::fixtures::clip(&p, 0).id;
    let moved = edit::apply(
        &p,
        &Edit::Move {
            id,
            track_id: p.tracks.headers().next().unwrap().id,
            start_ms: 500,
        },
    )
    .unwrap();
    assert!(moved.clips.headers().all(|c| c.start_ms == 500));
    let trimmed = edit::apply(
        &moved,
        &Edit::Trim {
            id,
            source_in_ms: 1000,
            duration_ms: 4000,
            start_ms: 1500,
        },
    )
    .unwrap();
    assert!(
        trimmed
            .clips
            .headers()
            .all(|c| c.source_in_ms == 1000 && c.duration_ms == 4000 && c.start_ms == 1500)
    );
    let retimed = edit::apply(
        &trimmed,
        &Edit::Retime {
            id,
            rate: beam_editor_domain::timing::Rate {
                numerator: 2,
                denominator: 1,
            },
            duration_ms: 2000,
        },
    )
    .unwrap();
    assert!(
        retimed
            .clips
            .headers()
            .all(|c| c.rate.numerator == 2 && c.duration_ms == 2000)
    );
    assert_eq!(crate::fixtures::clip(&p, 0).start_ms, 0);
}
#[test]
fn split_regroups_both_new_halves_and_delete_removes_dependent_linked_clips() {
    let p = linked();
    let id = crate::fixtures::clip(&p, 0).id;
    let split = edit::apply(&p, &Edit::Split { id, time_ms: 3000 }).unwrap();
    assert_eq!(split.clips.len(), 4);
    let old = crate::fixtures::clip(&p, 0).link_group;
    assert_eq!(
        split
            .clips
            .headers()
            .filter(|c| c.link_group == old)
            .count(),
        2
    );
    let right: Vec<_> = split
        .clips
        .headers()
        .filter(|c| c.start_ms == 3000)
        .collect();
    assert_eq!(right[0].link_group, right[1].link_group);
    assert_ne!(right[0].link_group, old);
    assert!(
        edit::apply(&p, &Edit::Remove { id })
            .unwrap()
            .clips
            .is_empty()
    );
}
#[test]
fn links_reject_missing_duplicate_and_different_windows_without_partial_mutation() {
    let mut p = crate::fixtures::project();
    let before = p.clone();
    let id = crate::fixtures::clip(&p, 0).id;
    assert!(links::link(&mut p, &[id, id]).is_err());
    assert_eq!(p, before);
    assert!(links::link(&mut p, &[id, Uuid::new_v4()]).is_err());
    let mut other = (*crate::fixtures::clip(&p, 0)).clone();
    other.id = Uuid::new_v4();
    other.duration_ms -= 1;
    p.clips.try_push(other).unwrap();
    let before = p.clone();
    let ids: Vec<_> = p.clips.headers().map(|c| c.id).collect();
    assert!(links::link(&mut p, &ids).is_err());
    assert_eq!(p, before);
}
#[test]
fn unlink_allows_independent_edits_and_validation_rejects_corrupt_groups() {
    let p = linked();
    let id = crate::fixtures::clip(&p, 0).id;
    let unlinked = edit::apply(&p, &Edit::Unlink { id }).unwrap();
    assert!(unlinked.clips.headers().all(|c| c.link_group.is_none()));
    let moved = edit::apply(
        &unlinked,
        &Edit::Move {
            id,
            track_id: p.tracks.headers().next().unwrap().id,
            start_ms: 1000,
        },
    )
    .unwrap();
    assert_eq!(crate::fixtures::clip(&moved, 1).start_ms, 0);
    let mut broken = p.clone();
    crate::fixtures::clip_mut(&mut broken, 1).duration_ms -= 1;
    assert!(validation::project(&broken).is_err());
    let last_id = broken.clips.headers().last().unwrap().id;
    broken.clips.try_remove(last_id).unwrap();
    assert!(validation::project(&broken).is_err());
    assert!(links::unlink(&mut broken, Uuid::new_v4()).is_err());
}
#[test]
fn ripple_requires_both_linked_lanes_and_keeps_right_group_distinct() {
    let mut p = linked();
    let before = p.clone();
    assert!(
        beam_editor_domain::timeline::range::ripple_delete(
            &mut p,
            2000,
            4000,
            &[before.tracks.headers().next().unwrap().id]
        )
        .is_err()
    );
    assert_eq!(p, before);
    beam_editor_domain::timeline::range::ripple_delete(
        &mut p,
        2000,
        4000,
        &before.tracks.headers().map(|t| t.id).collect::<Vec<_>>(),
    )
    .unwrap();
    validation::project(&p).unwrap();
    assert_eq!(p.clips.len(), 4);
}
#[test]
fn lane_removal_requires_explicit_content_deletion_and_unlinks_surviving_media() {
    let p = linked();
    let id = p.tracks.headers().next().unwrap().id;
    assert!(
        edit::apply(
            &p,
            &Edit::TrackRemove {
                id,
                delete_clips: false
            }
        )
        .is_err()
    );
    let remaining = edit::apply(
        &p,
        &Edit::TrackRemove {
            id,
            delete_clips: true,
        },
    )
    .unwrap();
    assert_eq!(remaining.clips.len(), 1);
    assert!(crate::fixtures::clip(&remaining, 0).link_group.is_none());
    let reordered = edit::apply(&p, &Edit::TrackReorder { id, index: 1 }).unwrap();
    assert_eq!(reordered.tracks.headers().nth(1).unwrap().id, id);
    assert!(edit::apply(&p, &Edit::TrackReorder { id, index: 2 }).is_err());
    assert!(
        edit::apply(
            &p,
            &Edit::TrackRename {
                id,
                name: "  ".into()
            }
        )
        .is_err()
    );
}
