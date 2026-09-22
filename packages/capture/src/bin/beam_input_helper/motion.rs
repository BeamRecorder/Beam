use capture::input::NativeInputEvent;
use evdev::{AbsoluteAxisCode, RelativeAxisCode};

#[derive(Default)]
pub(super) struct MotionAccumulator {
    delta_x: i32,
    delta_y: i32,
    absolute_x: Option<i32>,
    absolute_y: Option<i32>,
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

    pub(super) fn push_absolute(&mut self, axis: AbsoluteAxisCode, value: i32) {
        // These device-space deltas only preserve motion timing between
        // PipeWire cursor anchors; they are not global screen coordinates.
        let (previous, delta) = match axis {
            AbsoluteAxisCode::ABS_X => (&mut self.absolute_x, &mut self.delta_x),
            AbsoluteAxisCode::ABS_Y => (&mut self.absolute_y, &mut self.delta_y),
            _ => return,
        };
        if let Some(previous) = previous.replace(value) {
            *delta = delta.saturating_add(value.saturating_sub(previous));
        }
    }

    pub(super) fn release_absolute_contact(&mut self) {
        self.absolute_x = None;
        self.absolute_y = None;
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
        self.release_absolute_contact();
    }
}

#[path = "../../../test/bin/beam_input_helper/motion.rs"]
mod motion_checks;
