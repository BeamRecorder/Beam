use std::path::PathBuf;

use crate::{
    CaptureError,
    input::{InputEvent, InputEventSidecar, NativeInputEvent},
    storage::write_atomic,
};

use super::LinuxInputMonitor;

pub(crate) enum MappedInputEvent {
    Motion {
        session_ns: u64,
        delta_x: i32,
        delta_y: i32,
    },
    Persistent(InputEvent),
}

pub(crate) struct InputTimeline {
    directory: PathBuf,
    monitor: Option<LinuxInputMonitor>,
    anchor: Option<(u64, u64)>,
    events: Vec<InputEvent>,
    capture_clicks: bool,
    capture_shortcuts: bool,
}

impl InputTimeline {
    pub(crate) fn new(
        directory: PathBuf,
        capture_clicks: bool,
        capture_shortcuts: bool,
    ) -> Result<Option<Self>, CaptureError> {
        let Some(monitor) = LinuxInputMonitor::start()? else {
            return Ok(None);
        };
        Ok(Some(Self {
            directory,
            monitor: Some(monitor),
            anchor: None,
            events: Vec::new(),
            capture_clicks,
            capture_shortcuts,
        }))
    }

    pub(crate) fn drain(
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
            .filter(|event| match event {
                NativeInputEvent::MouseButton { .. } => self.capture_clicks,
                NativeInputEvent::Shortcut { .. } => self.capture_shortcuts,
                NativeInputEvent::MouseMotion { .. } => true,
            })
            .map(|event| map_input_event(event, native_anchor, session_anchor))
            .collect::<Vec<_>>();
        if self.events.len().saturating_add(mapped.len()) > 1_000_000 {
            return Err(CaptureError::Backend(
                "input event storage limit reached".into(),
            ));
        }
        self.events
            .extend(mapped.iter().filter_map(|event| match event {
                MappedInputEvent::Persistent(event) => Some(event.clone()),
                MappedInputEvent::Motion { .. } => None,
            }));
        Ok(mapped)
    }

    pub(crate) fn stop(&mut self) {
        if let Some(monitor) = self.monitor.as_mut() {
            monitor.stop();
        }
    }

    pub(crate) fn reset_anchor(&mut self) {
        self.anchor = None;
    }

    pub(crate) fn finalize(&mut self) -> Result<(), CaptureError> {
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

#[path = "../../../test/screen/linux/input_timeline.rs"]
mod input_timeline_checks;
