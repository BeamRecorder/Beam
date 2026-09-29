use beam_editor_domain::{
    animation::{Binding, Interpolation, Keyframe, Tangent, Value},
    timing::{Time, TimeSpace},
};
use uuid::Uuid;

fn key(at: i64, value: f64) -> Keyframe {
    Keyframe {
        id: Uuid::new_v4(),
        time: Time::milliseconds(at),
        value: Value::Number(value),
        interpolation: Interpolation::Linear,
    }
}

#[test]
fn linear_curve_is_deterministic_for_out_of_order_seeks_and_clamps_ends() {
    let curve = Binding::Curve {
        space: TimeSpace::Sequence,
        keys: vec![key(0, 0.), key(1000, 10.)],
    };
    assert_eq!(curve.evaluate(Time::milliseconds(750)), Value::Number(7.5));
    assert_eq!(curve.evaluate(Time::milliseconds(250)), Value::Number(2.5));
    assert_eq!(curve.evaluate(Time::milliseconds(-1)), Value::Number(0.));
    assert_eq!(curve.evaluate(Time::milliseconds(1001)), Value::Number(10.));
}

#[test]
fn discrete_curves_reject_interpolation_and_duplicate_or_unsorted_keys() {
    let id = Uuid::new_v4();
    let discrete = Keyframe {
        id,
        time: Time::milliseconds(0),
        value: Value::Boolean(true),
        interpolation: Interpolation::Linear,
    };
    assert!(
        Binding::Curve {
            space: TimeSpace::ClipLocal,
            keys: vec![discrete.clone()]
        }
        .validate()
        .is_err()
    );
    let a = key(100, 1.);
    let mut b = key(0, 2.);
    b.id = a.id;
    assert!(
        Binding::Curve {
            space: TimeSpace::Source,
            keys: vec![a, b]
        }
        .validate()
        .is_err()
    );
}

#[test]
fn bezier_curve_uses_bounded_handles_and_evaluates_midpoint() {
    let mut first = key(0, 0.);
    first.interpolation = Interpolation::Bezier {
        outgoing: Tangent {
            time: 0.25,
            value: 0.1,
        },
        incoming: Tangent {
            time: 0.25,
            value: 0.1,
        },
    };
    let curve = Binding::Curve {
        space: TimeSpace::Sequence,
        keys: vec![first, key(1000, 1.)],
    };
    assert!(curve.validate().is_ok());
    let midpoint = curve.evaluate(Time::milliseconds(500)).number().unwrap();
    assert!(midpoint > 0.1 && midpoint < 0.9);
    let mut invalid = curve.clone();
    if let Binding::Curve { keys, .. } = &mut invalid {
        keys[0].interpolation = Interpolation::Bezier {
            outgoing: Tangent {
                time: 2.,
                value: 0.,
            },
            incoming: Tangent {
                time: 0.2,
                value: 0.2,
            },
        };
    }
    assert!(invalid.validate().is_err());
}
