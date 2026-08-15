use capture::input::NativeInputEvent;
use evdev::RelativeAxisCode;

#[derive(Default)]
pub(super) struct MotionAccumulator {
    delta_x: i32,
    delta_y: i32,
}

impl MotionAccumulator {
    pub(super) fn push(&mut self, axis: RelativeAxisCode, value: i32) {
        match axis {
            RelativeAxisCode::REL_X => {
                self.delta_x = self.delta_x.saturating_add(value);
            }
            RelativeAxisCode::REL_Y => {
                self.delta_y = self.delta_y.saturating_add(value);
            }
            _ => {}
        }
    }

    pub(super) fn take(&mut self, monotonic_ns: u64) -> Option<NativeInputEvent> {
        if self.delta_x == 0 && self.delta_y == 0 {
            return None;
        }
        let event = NativeInputEvent::MouseMotion {
            monotonic_ns,
            delta_x: self.delta_x,
            delta_y: self.delta_y,
        };
        self.delta_x = 0;
        self.delta_y = 0;
        Some(event)
    }

    pub(super) fn reset(&mut self) {
        self.delta_x = 0;
        self.delta_y = 0;
    }
}

#[cfg(test)]
mod tests {
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
}
