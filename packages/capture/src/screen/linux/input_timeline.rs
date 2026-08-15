use std::path::PathBuf;

use crate::{
    CaptureError,
    input::{InputEvent, InputEventSidecar, NativeInputEvent},
    storage::write_atomic,
};

use super::LinuxInputMonitor;

pub(super) enum MappedInputEvent {
    Motion {
        session_ns: u64,
        delta_x: i32,
        delta_y: i32,
    },
    Persistent(InputEvent),
}

pub(super) struct InputTimeline {
    directory: PathBuf,
    monitor: Option<LinuxInputMonitor>,
    anchor: Option<(u64, u64)>,
    events: Vec<InputEvent>,
}

impl InputTimeline {
    pub(super) fn new(directory: PathBuf) -> Result<Option<Self>, CaptureError> {
        let Some(monitor) = LinuxInputMonitor::start()? else {
            return Ok(None);
        };
        Ok(Some(Self {
            directory,
            monitor: Some(monitor),
            anchor: None,
            events: Vec::new(),
        }))
    }

    pub(super) fn drain(
        &mut self,
        first_sample_ns: Option<u64>,
    ) -> Result<Vec<MappedInputEvent>, CaptureError> {
        let Some(monitor) = self.monitor.as_ref() else {
            return Ok(Vec::new());
        };
        if self.anchor.is_none() {
            for _ in monitor.drain() {}
            if let Some(session_ns) = first_sample_ns {
                self.anchor = Some((monotonic_ns()?, session_ns));
            }
            return Ok(Vec::new());
        }
        let (native_anchor, session_anchor) = self.anchor.unwrap_or_default();
        let mapped = monitor
            .drain()
            .into_iter()
            .filter(|event| event.monotonic_ns() >= native_anchor)
            .map(|event| map_input_event(event, native_anchor, session_anchor))
            .collect::<Vec<_>>();
        self.events
            .extend(mapped.iter().filter_map(|event| match event {
                MappedInputEvent::Persistent(event) => Some(event.clone()),
                MappedInputEvent::Motion { .. } => None,
            }));
        Ok(mapped)
    }

    pub(super) fn stop(&mut self) {
        if let Some(monitor) = self.monitor.as_mut() {
            monitor.stop();
        }
    }

    pub(super) fn reset_anchor(&mut self) {
        self.anchor = None;
    }

    pub(super) fn finalize(&mut self) -> Result<(), CaptureError> {
        self.events.sort_by_key(InputEvent::session_ns);
        std::fs::create_dir_all(&self.directory)
            .map_err(|error| CaptureError::storage(&self.directory, error))?;
        write_atomic(
            &self.directory.join("input.json"),
            &serde_json::to_vec_pretty(&InputEventSidecar::new(self.events.clone()))?,
        )
    }
}

fn map_input_event(
    event: NativeInputEvent,
    native_anchor: u64,
    session_anchor: u64,
) -> MappedInputEvent {
    let session_ns =
        session_anchor.saturating_add(event.monotonic_ns().saturating_sub(native_anchor));
    match event {
        NativeInputEvent::MouseMotion {
            delta_x, delta_y, ..
        } => MappedInputEvent::Motion {
            session_ns,
            delta_x,
            delta_y,
        },
        NativeInputEvent::MouseButton {
            button, pressed, ..
        } => MappedInputEvent::Persistent(InputEvent::MouseButton {
            session_ns,
            button,
            pressed,
        }),
        NativeInputEvent::Shortcut {
            pressed,
            modifiers,
            key,
            ..
        } => MappedInputEvent::Persistent(InputEvent::Shortcut {
            session_ns,
            pressed,
            modifiers,
            key,
        }),
    }
}

fn monotonic_ns() -> Result<u64, CaptureError> {
    let mut timestamp = libc::timespec {
        tv_sec: 0,
        tv_nsec: 0,
    };
    // SAFETY: timestamp points to valid writable memory for the duration of the call.
    if unsafe { libc::clock_gettime(libc::CLOCK_MONOTONIC, &raw mut timestamp) } != 0 {
        return Err(CaptureError::Backend(format!(
            "monotonic input clock failed: {}",
            std::io::Error::last_os_error()
        )));
    }
    let seconds = u64::try_from(timestamp.tv_sec).unwrap_or(0);
    let nanoseconds = u64::try_from(timestamp.tv_nsec).unwrap_or(0);
    Ok(seconds
        .saturating_mul(1_000_000_000)
        .saturating_add(nanoseconds))
}

#[cfg(test)]
mod tests {
    use crate::input::{InputKey, InputModifier};

    use super::*;

    #[test]
    fn maps_motion_without_turning_it_into_a_persisted_input_event() {
        let mapped = map_input_event(
            NativeInputEvent::MouseMotion {
                monotonic_ns: 120,
                delta_x: 3,
                delta_y: -2,
            },
            100,
            1_000,
        );
        assert!(matches!(
            mapped,
            MappedInputEvent::Motion {
                session_ns: 1_020,
                delta_x: 3,
                delta_y: -2,
            }
        ));
    }

    #[test]
    fn maps_buttons_to_the_session_clock() {
        let mapped = map_input_event(
            NativeInputEvent::MouseButton {
                monotonic_ns: 150,
                button: 1,
                pressed: false,
            },
            100,
            1_000,
        );
        assert!(matches!(
            mapped,
            MappedInputEvent::Persistent(InputEvent::MouseButton {
                session_ns: 1_050,
                button: 1,
                pressed: false,
            })
        ));
    }

    #[test]
    fn maps_shortcuts_without_changing_their_structure() {
        let mapped = map_input_event(
            NativeInputEvent::Shortcut {
                monotonic_ns: 90,
                pressed: true,
                modifiers: vec![InputModifier::Control],
                key: InputKey::K,
            },
            100,
            1_000,
        );
        assert!(matches!(
            mapped,
            MappedInputEvent::Persistent(InputEvent::Shortcut {
                session_ns: 1_000,
                pressed: true,
                key: InputKey::K,
                ..
            })
        ));
    }
}
