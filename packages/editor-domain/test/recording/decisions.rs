use crate::fixtures::{decision, decision_mut};
use beam_editor_domain::{
    Document, Edit,
    animation::{Binding, Value},
    recording::{decisions, style_types::ZoomDefaults, types::Zoom},
    timeline::history,
};

pub fn zoom_project() -> beam_editor_domain::Project {
    let mut p = crate::fixtures::project();
    p.assets[0].zooms = vec![
        Zoom {
            start_ms: 1000,
            end_ms: 3000,
            cx: 0.75,
            cy: 0.4,
            scale: 2.,
        },
        Zoom {
            start_ms: 3500,
            end_ms: 5000,
            cx: 0.3,
            cy: 0.6,
            scale: 2.5,
        },
    ]
    .into();
    p
}
#[test]
fn migration_preserves_immutable_sources_and_reproduces_ids_in_every_history_lineage() {
    let mut document = Document::new(zoom_project());
    let original = document.project.assets.clone();
    document = history::edited(
        &document,
        &Edit::Rename {
            name: "Changed".into(),
        },
    )
    .unwrap();
    document.project_undo.push(
        beam_editor_domain::timeline::project_history_types::ProjectAction::InsertSequence {
            sequence: Box::new(document.sequences[0].clone()),
            index: 0,
            active: document.active_sequence,
        },
    );
    decisions::migrate_document(&mut document).unwrap();
    assert_eq!(document.project.assets, original);
    assert_eq!(decision(&document.project.clips, 0).instances.len(), 2);
    let ids: Vec<_> = decision(&document.project.clips, 0)
        .instances
        .iter()
        .map(|i| i.id)
        .collect();
    assert_eq!(
        ids,
        decision(&document.undo[0].clips, 0)
            .instances
            .iter()
            .map(|i| i.id)
            .collect::<Vec<_>>()
    );
    let beam_editor_domain::timeline::project_history_types::ProjectAction::InsertSequence {
        sequence,
        ..
    } = &document.project_undo[0]
    else {
        panic!()
    };
    assert_eq!(
        ids,
        decision(&sequence.state.clips, 0)
            .instances
            .iter()
            .map(|i| i.id)
            .collect::<Vec<_>>()
    );
    assert_eq!(
        ids,
        decision(&document.sequences[0].state.clips, 0)
            .instances
            .iter()
            .map(|i| i.id)
            .collect::<Vec<_>>()
    );
    let before = document.clone();
    decisions::migrate_document(&mut document).unwrap();
    assert_eq!(document, before);
}
#[test]
fn suggestions_remain_unapplied_when_legacy_auto_zoom_was_disabled() {
    let mut p = zoom_project();
    decision_mut(&mut p.clips, 0).effects.auto_zoom = false;
    decisions::apply_suggestions(&mut decision_mut(&mut p.clips, 0), &p.assets[0]);
    assert!(decision(&p.clips, 0).instances.is_empty());
    assert_eq!(p.assets[0].zooms.len(), 2);
}
#[test]
fn applying_a_suggestion_creates_new_occurrences_and_validates_missing_index() {
    let p = zoom_project();
    let defaults = ZoomDefaults {
        scale: 3.25,
        entry_ms: 700,
        follow_cursor: false,
        ..Default::default()
    };
    let first =
        decisions::from_suggestion(&decision(&p.clips, 0), &p.assets[0], 0, &defaults).unwrap();
    let second =
        decisions::from_suggestion(&decision(&p.clips, 0), &p.assets[0], 0, &defaults).unwrap();
    assert_ne!(first.id, second.id);
    assert_eq!(
        first.parameters["scale"],
        Binding::constant(Value::Number(3.25))
    );
    assert_eq!(p.assets[0].zooms[0].scale, 2.);
    assert_eq!(
        first.parameters["entryMs"],
        Binding::constant(Value::Number(700.))
    );
    assert!(first.validate(&p.definitions).is_ok());
    assert!(
        decisions::from_suggestion(&decision(&p.clips, 0), &p.assets[0], 2, &defaults).is_err()
    );
    assert!(
        decisions::from_suggestion(
            &decision(&p.clips, 0),
            &p.assets[0],
            0,
            &ZoomDefaults {
                scale: f64::NAN,
                ..defaults
            }
        )
        .is_err()
    );
}

#[test]
fn migration_rejects_conflicting_definition_versions_without_changing_history_or_telemetry() {
    let mut project = zoom_project();
    project
        .definitions
        .iter_mut()
        .find(|definition| definition.id == decisions::ZOOM_DEFINITION)
        .unwrap()
        .label = "Different immutable definition".into();
    let mut document = Document::new(project);
    document
        .undo
        .push(beam_editor_domain::EditState::capture(&document.project));
    let original = document.clone();
    assert!(
        decisions::migrate_document(&mut document)
            .unwrap_err()
            .to_string()
            .contains("conflicts with definition")
    );
    assert_eq!(document, original);
}
