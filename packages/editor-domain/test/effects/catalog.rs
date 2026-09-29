use crate::fixtures::{decision, decision_mut};
use beam_editor_domain::{
    Project,
    animation::{Binding, Interpolation, Keyframe, Value},
    effects::{Domain, Instance, catalog::builtins},
    project::validation,
};
use uuid::Uuid;

#[test]
fn repeated_effect_definition_keeps_each_instance_order_and_identity() {
    let mut project = crate::fixtures::project();
    let definition = project
        .definitions
        .iter()
        .find(|d| d.id == "beam.opacity")
        .unwrap()
        .clone();
    for _ in 0..100 {
        let mut instance = definition.instantiate();
        let key = Keyframe {
            id: Uuid::new_v4(),
            time: beam_editor_domain::timing::Time::milliseconds(0),
            value: Value::Number(0.5),
            interpolation: Interpolation::Constant,
        };
        instance.parameters.insert(
            "opacity".into(),
            Binding::Curve {
                space: beam_editor_domain::timing::TimeSpace::ClipLocal,
                keys: vec![key],
            },
        );
        decision_mut(&mut project.clips, 0).instances.push(instance);
    }
    let ids: std::collections::HashSet<_> = decision(&project.clips, 0)
        .instances
        .iter()
        .map(|instance| instance.id)
        .collect();
    assert_eq!(ids.len(), 100);
    assert_eq!(
        decision(&project.clips, 0).instances[0].definition_id,
        decision(&project.clips, 0).instances[99].definition_id
    );
    assert_ne!(
        decision(&project.clips, 0).instances[0].id,
        decision(&project.clips, 0).instances[99].id
    );
    assert!(validation::project(&project).is_ok());
    let copy = decision(&project.clips, 0).instances[0].duplicate();
    assert_ne!(copy.id, decision(&project.clips, 0).instances[0].id);
    assert_ne!(
        copy.parameters["opacity"],
        decision(&project.clips, 0).instances[0].parameters["opacity"]
    );
}

#[test]
fn typed_definitions_reject_wrong_domains_duplicate_parameters_and_out_of_range_values() {
    let mut definitions = builtins();
    let mut opacity = definitions
        .iter()
        .find(|d| d.id == "beam.opacity")
        .unwrap()
        .clone();
    let parameter = opacity.parameters[0].clone();
    assert!(parameter.validate_value(&Value::Number(1.01)).is_err());
    opacity.parameters.push(parameter);
    assert!(opacity.validate().is_err());
    let invalid = definitions
        .iter_mut()
        .find(|d| d.id == "beam.crossfade")
        .unwrap();
    invalid.domain = Domain::Video;
    assert!(invalid.validate().is_err());
}

#[test]
fn definitions_produce_fresh_instances_with_declared_defaults() {
    let project = Project::new("catalog".into());
    let definition = project
        .definitions
        .iter()
        .find(|d| d.id == "beam.opacity")
        .unwrap();
    let left: Instance = definition.instantiate();
    let right: Instance = definition.instantiate();
    assert_ne!(left.id, right.id);
    assert_eq!(
        left.parameters["opacity"],
        Binding::constant(Value::Number(1.))
    );
    assert_eq!(left.parameters.len(), 1);
    assert!(
        Project::new("catalog".into())
            .definitions
            .iter()
            .any(|d| d.id == "beam.solid")
    );
}

#[test]
fn bypass_and_effect_ranges_are_independent_of_instance_identity() {
    let project = crate::fixtures::project();
    let definition = project
        .definitions
        .iter()
        .find(|definition| definition.id == "beam.opacity")
        .unwrap()
        .clone();
    let mut instance = definition.instantiate();
    instance.enabled = false;
    instance.range = Some(beam_editor_domain::timing::TimeRange {
        space: beam_editor_domain::timing::TimeSpace::ClipLocal,
        start: beam_editor_domain::timing::Time::milliseconds(100),
        end: beam_editor_domain::timing::Time::milliseconds(200),
    });
    let clip = &decision(&project.clips, 0);
    assert!(
        !instance
            .active(&clip, beam_editor_domain::timing::Time::milliseconds(150))
            .unwrap()
    );
    instance.enabled = true;
    assert!(
        instance
            .active(&clip, beam_editor_domain::timing::Time::milliseconds(150))
            .unwrap()
    );
    assert!(
        !instance
            .active(&clip, beam_editor_domain::timing::Time::milliseconds(200))
            .unwrap()
    );
    let clone = instance.duplicate();
    assert_ne!(clone.id, instance.id);
    assert_eq!(clone.definition_id, instance.definition_id);
}

#[test]
fn stack_reorder_bypass_and_remove_target_one_instance_without_merging_siblings() {
    let mut project = crate::fixtures::project();
    let definition = project
        .definitions
        .iter()
        .find(|definition| definition.id == "beam.opacity")
        .unwrap()
        .clone();
    let first = definition.instantiate();
    let second = definition.instantiate();
    let first_id = first.id;
    let second_id = second.id;
    decision_mut(&mut project.clips, 0).instances = vec![first, second];
    let clip_id = decision(&project.clips, 0).id;
    let reordered = beam_editor_domain::timeline::edit::apply(
        &project,
        &beam_editor_domain::Edit::EffectReorder {
            clip_id,
            instance_id: second_id,
            index: 0,
        },
    )
    .unwrap();
    assert_eq!(
        decision(&reordered.clips, 0)
            .instances
            .iter()
            .map(|effect| effect.id)
            .collect::<Vec<_>>(),
        vec![second_id, first_id]
    );
    let mut bypassed = decision(&reordered.clips, 0).instances[0].clone();
    bypassed.enabled = false;
    let bypassed = beam_editor_domain::timeline::edit::apply(
        &reordered,
        &beam_editor_domain::Edit::EffectUpdate {
            clip_id,
            instance: bypassed,
        },
    )
    .unwrap();
    assert!(!decision(&bypassed.clips, 0).instances[0].enabled);
    assert_eq!(decision(&bypassed.clips, 0).instances[1].id, first_id);
    let removed = beam_editor_domain::timeline::edit::apply(
        &bypassed,
        &beam_editor_domain::Edit::EffectRemove {
            clip_id,
            instance_id: second_id,
        },
    )
    .unwrap();
    assert_eq!(decision(&removed.clips, 0).instances.len(), 1);
    assert_eq!(decision(&removed.clips, 0).instances[0].id, first_id);
}
