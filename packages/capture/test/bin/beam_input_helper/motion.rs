#![cfg(test)]

use super::*;

#[test]
fn relative_axes_are_aggregated_into_one_motion_report() {
    let mut motion = MotionAccumulator::default();
    motion.push(RelativeAxisCode::REL_X, 4);
    motion.push(RelativeAxisCode::REL_Y, -3);
    assert_eq!(
        motion.take(42),
        Some(NativeInputEvent::MouseMotion {
            monotonic_ns: 42,
            delta_x: 4,
            delta_y: -3,
        })
    );
    assert_eq!(motion.take(43), None);
}

#[test]
fn wheel_axes_are_not_treated_as_pointer_motion() {
    let mut motion = MotionAccumulator::default();
    motion.push(RelativeAxisCode::REL_WHEEL, 1);
    motion.push(RelativeAxisCode::REL_HWHEEL_HI_RES, 120);
    assert_eq!(motion.take(42), None);
}

#[test]
fn absolute_axes_establish_a_baseline_before_emitting_motion() {
    let mut motion = MotionAccumulator::default();
    motion.push_absolute(AbsoluteAxisCode::ABS_X, 1_000);
    motion.push_absolute(AbsoluteAxisCode::ABS_Y, 500);
    assert_eq!(motion.take(41), None);

    motion.push_absolute(AbsoluteAxisCode::ABS_X, 1_012);
    motion.push_absolute(AbsoluteAxisCode::ABS_Y, 493);
    assert_eq!(
        motion.take(42),
        Some(NativeInputEvent::MouseMotion {
            monotonic_ns: 42,
            delta_x: 12,
            delta_y: -7,
        })
    );
}

#[test]
fn multitouch_slot_axes_are_not_mistaken_for_the_primary_pointer() {
    let mut motion = MotionAccumulator::default();
    motion.push_absolute(AbsoluteAxisCode::ABS_MT_POSITION_X, 1_000);
    motion.push_absolute(AbsoluteAxisCode::ABS_MT_POSITION_Y, 500);
    assert_eq!(motion.take(42), None);
}

#[test]
fn releasing_absolute_contact_prevents_a_jump_between_touches() {
    let mut motion = MotionAccumulator::default();
    motion.push_absolute(AbsoluteAxisCode::ABS_X, 1_000);
    motion.push_absolute(AbsoluteAxisCode::ABS_Y, 500);
    motion.release_absolute_contact();
    motion.push_absolute(AbsoluteAxisCode::ABS_X, 2_000);
    motion.push_absolute(AbsoluteAxisCode::ABS_Y, 1_500);
    assert_eq!(motion.take(42), None);
}

#[test]
fn relative_motion_saturates_instead_of_overflowing() {
    let mut motion = MotionAccumulator::default();
    motion.push(RelativeAxisCode::REL_X, i32::MAX);
    motion.push(RelativeAxisCode::REL_X, 10);
    assert!(matches!(
        motion.take(42),
        Some(NativeInputEvent::MouseMotion {
            delta_x: i32::MAX,
            delta_y: 0,
            ..
        })
    ));
}

#[test]
fn reset_discards_motion_before_a_kernel_discontinuity() {
    let mut motion = MotionAccumulator::default();
    motion.push(RelativeAxisCode::REL_X, 12);
    motion.reset();
    assert_eq!(motion.take(42), None);
}
