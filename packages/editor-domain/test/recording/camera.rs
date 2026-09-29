use crate::fixtures::{decision, decision_mut};
use beam_editor_domain::{
    Document, Edit,
    animation::{Binding, Value},
    recording::{camera, control, decisions},
    timeline::history,
    timing::{Time, TimeRange, TimeSpace},
};

#[test]
fn migrated_legacy_zoom_group_preserves_every_original_camera_key_exactly() {
    let mut document = Document::new(super::decisions::zoom_project());
    let original = control::compile(&document.project.assets[0]).unwrap();
    decisions::migrate_document(&mut document).unwrap();
    let clip = decision(&document.project.clips, 0);
    let actual = camera::compile(&document.project.assets[0], &clip, clip.instances[0].id).unwrap();
    assert_eq!(original.len(), actual.len());
    for (a, b) in original.iter().zip(actual) {
        assert_eq!(a.time_ms, b.time_ms);
        assert_eq!(a.camera, b.camera);
    }
    let second = camera::compile(&document.project.assets[0], &clip, clip.instances[1].id).unwrap();
    assert!(second.iter().all(|key| key.camera.scale == 1.));
}
#[test]
fn camera_curves_survive_split_and_undo_without_changing_source_time_motion() {
    let mut document = Document::new(super::decisions::zoom_project());
    decisions::migrate_document(&mut document).unwrap();
    let id = decision(&document.project.clips, 0).id;
    let old_clip = &decision(&document.project.clips, 0);
    let expected = camera::compile(
        &document.project.assets[0],
        old_clip,
        old_clip.instances[0].id,
    )
    .unwrap();
    let split = history::edited(&document, &Edit::Split { id, time_ms: 2000 }).unwrap();
    for clip in split.project.clips.try_iter() {
        let clip = clip.unwrap();
        let actual =
            camera::compile(&split.project.assets[0], &clip, clip.instances[0].id).unwrap();
        assert_eq!(
            actual
                .iter()
                .map(|k| (k.time_ms, k.camera))
                .collect::<Vec<_>>(),
            expected
                .iter()
                .map(|k| (k.time_ms, k.camera))
                .collect::<Vec<_>>()
        );
    }
    let undone = history::edited(&split, &Edit::Undo {}).unwrap();
    assert_eq!(undone.project.clips, document.project.clips);
}
#[test]
fn custom_zoom_regions_are_half_open_seek_safe_and_support_short_easing() {
    let p = super::decisions::zoom_project();
    let clip = decision(&p.clips, 0);
    let mut instance = p
        .definitions
        .iter()
        .find(|d| d.id == decisions::ZOOM_DEFINITION)
        .unwrap()
        .instantiate();
    instance.range = Some(TimeRange {
        space: TimeSpace::Source,
        start: Time::milliseconds(1000),
        end: Time::milliseconds(1200),
    });
    instance.parameters.insert(
        "followCursor".into(),
        Binding::constant(Value::Boolean(false)),
    );
    instance.parameters.insert(
        "center".into(),
        Binding::constant(Value::Point([0.75, 0.5])),
    );
    let sample =
        |time| camera::evaluate(&instance, &p.assets[0], &clip, Time::milliseconds(time)).unwrap();
    assert_eq!(sample(999).scale, 1.);
    assert_eq!(sample(1200).scale, 1.);
    assert_eq!(sample(1100).scale, 2.);
    assert_eq!(sample(1100), sample(1100));
    assert!(sample(1050).scale > 1.);
    assert_eq!(sample(1000).scale, 1.);
}
#[test]
fn unknown_camera_instance_and_over_budget_curve_fail_explicitly() {
    let mut p = super::decisions::zoom_project();
    assert!(camera::compile(&p.assets[0], &decision(&p.clips, 0), uuid::Uuid::new_v4()).is_err());
    let mut instance = p
        .definitions
        .iter()
        .find(|d| d.id == decisions::ZOOM_DEFINITION)
        .unwrap()
        .instantiate();
    instance.range = Some(TimeRange {
        space: TimeSpace::Source,
        start: Time::ZERO,
        end: Time::milliseconds(10_000_000),
    });
    p.assets[0].duration_ms = 10_000_000;
    decision_mut(&mut p.clips, 0)
        .instances
        .push(instance.clone());
    assert!(camera::compile(&p.assets[0], &decision(&p.clips, 0), instance.id).is_err());
}

#[test]
fn camera_evaluation_propagates_invalid_region_mapping_instead_of_returning_rest() {
    let mut project = super::decisions::zoom_project();
    let mut instance = project
        .definitions
        .iter()
        .find(|d| d.id == decisions::ZOOM_DEFINITION)
        .unwrap()
        .instantiate();
    instance.range = Some(TimeRange {
        space: TimeSpace::Source,
        start: Time::ZERO,
        end: Time::milliseconds(1000),
    });
    decision_mut(&mut project.clips, 0).rate.denominator = 0;
    assert!(
        camera::evaluate(
            &instance,
            &project.assets[0],
            &decision(&project.clips, 0),
            Time::ZERO
        )
        .is_err()
    );
    decision_mut(&mut project.clips, 0).rate.denominator = 1;
    instance.parameters.remove("center");
    assert!(
        camera::evaluate(
            &instance,
            &project.assets[0],
            &decision(&project.clips, 0),
            Time::milliseconds(500)
        )
        .is_err()
    );
}
