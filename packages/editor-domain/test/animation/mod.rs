use crate::fixtures::{decision, decision_mut};
mod types;

#[test]
fn sequence_binding_propagates_invalid_clock_and_source_mapping_errors() {
    use beam_editor_domain::{
        animation::{Binding, Interpolation, Keyframe, Value},
        timing::{Time, TimeSpace},
    };
    let mut project = crate::fixtures::project();
    let constant = Binding::constant(Value::Number(1.));
    assert!(
        constant
            .at_sequence(
                &decision(&project.clips, 0),
                Time {
                    ticks: 1,
                    timescale: 0
                }
            )
            .is_err()
    );
    let source = Binding::Curve {
        space: TimeSpace::Source,
        keys: vec![Keyframe {
            id: uuid::Uuid::new_v4(),
            time: Time::ZERO,
            value: Value::Number(1.),
            interpolation: Interpolation::Linear,
        }],
    };
    decision_mut(&mut project.clips, 0).rate.denominator = 0;
    assert!(
        source
            .at_sequence(&decision(&project.clips, 0), Time::ZERO)
            .is_err()
    );
    decision_mut(&mut project.clips, 0).rate.denominator = 1;
    assert_eq!(
        source
            .at_sequence(&decision(&project.clips, 0), Time::ZERO)
            .unwrap(),
        Value::Number(1.)
    );
}
