use super::{
    input_motion::MotionAccumulator,
    linux::{InputFilter, write_stream_event},
};
use evdev::{EventSummary, InputEvent, KeyCode, SynchronizationCode};
use std::io::Write;

/// Preserve motion-before-button ordering and never persist unmodified text keys.
pub(super) fn write_event(
    output: &mut impl Write,
    filter: &mut InputFilter,
    motion: &mut MotionAccumulator,
    event: InputEvent,
    monotonic_ns: u64,
) -> Result<bool, Box<dyn std::error::Error>> {
    let mut emitted = false;
    match event.destructure() {
        EventSummary::RelativeAxis(_, axis, value) => motion.push(axis, value),
        EventSummary::AbsoluteAxis(_, axis, value) => motion.push_absolute(axis, value),
        EventSummary::Key(_, key, value) => {
            if let Some(relative) = motion.take(monotonic_ns) {
                write_stream_event(output, &relative)?;
                emitted = true;
            }
            if key == KeyCode::BTN_TOUCH && value == 0 {
                motion.release_absolute_contact();
            }
            if let Some(filtered) = filter.apply(key, value, monotonic_ns) {
                write_stream_event(output, &filtered)?;
                emitted = true;
            }
        }
        EventSummary::Synchronization(_, SynchronizationCode::SYN_REPORT, _) => {
            if let Some(relative) = motion.take(monotonic_ns) {
                write_stream_event(output, &relative)?;
                emitted = true;
            }
        }
        EventSummary::Synchronization(_, SynchronizationCode::SYN_DROPPED, _) => motion.reset(),
        _ => {}
    }
    Ok(emitted)
}

#[path = "../../../test/bin/beam_input_helper/events.rs"]
mod event_checks;
