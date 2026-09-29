use crate::fixtures::{decision, decision_mut};
mod catalog;
mod native_contract;
mod pack;
mod pack_types;
mod scope_types;
mod scopes;
mod shaders;
mod transition_types;
mod transitions;
mod types;

#[test]
fn evaluation_and_region_activation_propagate_mapping_errors_even_when_bypassed() {
    use beam_editor_domain::{
        animation::{Binding, Interpolation, Keyframe, Value},
        timing::{Time, TimeRange, TimeSpace},
    };
    let mut project = crate::fixtures::project();
    let mut instance = project
        .definitions
        .iter()
        .find(|d| d.id == "beam.opacity")
        .unwrap()
        .instantiate();
    let invalid = Time {
        ticks: 1,
        timescale: 0,
    };
    assert!(
        instance
            .evaluated(&decision(&project.clips, 0), invalid)
            .is_err()
    );
    assert!(
        instance
            .active(&decision(&project.clips, 0), invalid)
            .is_err()
    );
    instance.range = Some(TimeRange {
        space: TimeSpace::Source,
        start: Time::ZERO,
        end: Time::milliseconds(500),
    });
    instance.parameters.insert(
        "opacity".into(),
        Binding::Curve {
            space: TimeSpace::Source,
            keys: vec![Keyframe {
                id: uuid::Uuid::new_v4(),
                time: Time::ZERO,
                value: Value::Number(0.5),
                interpolation: Interpolation::Linear,
            }],
        },
    );
    instance.enabled = false;
    decision_mut(&mut project.clips, 0).rate.numerator = 0;
    assert!(
        instance
            .active(&decision(&project.clips, 0), Time::ZERO)
            .is_err()
    );
    assert!(
        instance
            .evaluated(&decision(&project.clips, 0), Time::ZERO)
            .is_err()
    );
    decision_mut(&mut project.clips, 0).rate.numerator = 1;
    assert!(
        !instance
            .active(&decision(&project.clips, 0), Time::ZERO)
            .unwrap()
    );
    assert_eq!(
        instance
            .evaluated(&decision(&project.clips, 0), Time::ZERO)
            .unwrap()["opacity"],
        Value::Number(0.5)
    );
}
mod migration;
mod placement;
mod placement_types;
mod preset_types;
mod presets;
