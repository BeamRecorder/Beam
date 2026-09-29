//! Window-scoped timing from queued host work to its first presented frame.

use argui_platform::{PlatformEvent, WindowKey};
use argui_runtime::{RuntimeEvent, WindowRuntimeEvent};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

static PROBE: OnceLock<Mutex<PresentationProbe>> = OnceLock::new();

#[derive(Default)]
pub(crate) struct PresentationProbe {
    windows: HashMap<WindowKey, WindowProbe>,
}

struct WindowProbe {
    visible: bool,
    entered: Option<Instant>,
}

impl PresentationProbe {
    /// Starts before submitting a batch, retaining the oldest pending visible work.
    pub(crate) fn mark(&mut self, window: &WindowKey, now: Instant) {
        let probe = self
            .windows
            .entry(window.clone())
            .or_insert_with(|| WindowProbe {
                visible: *window == WindowKey::main(),
                entered: None,
            });
        if probe.visible {
            probe.entered.get_or_insert(now);
        }
    }

    /// Removes work that failed to reach the native tree.
    pub(crate) fn discard(&mut self, window: &WindowKey) {
        if let Some(probe) = self.windows.get_mut(window) {
            probe.entered = None;
        }
    }

    /// Consumes only the matching presentation, ignoring intentionally hidden mounts.
    pub(crate) fn observe(
        &mut self,
        event: &RuntimeEvent,
        now: Instant,
    ) -> Option<(WindowKey, Duration)> {
        match event {
            RuntimeEvent::Platform(event) => self.platform(&WindowKey::main(), event),
            RuntimeEvent::Window {
                window,
                event: WindowRuntimeEvent::Platform(event),
            } => self.platform(window, event),
            RuntimeEvent::RenderProfile(_) => return self.presented(&WindowKey::main(), now),
            RuntimeEvent::Window {
                window,
                event: WindowRuntimeEvent::RenderProfile(_),
            } => return self.presented(window, now),
            _ => {}
        }
        None
    }

    fn platform(&mut self, window: &WindowKey, event: &PlatformEvent) {
        if let PlatformEvent::VisibilityChanged(visible) = event {
            self.windows.insert(
                window.clone(),
                WindowProbe {
                    visible: *visible,
                    entered: None,
                },
            );
        }
    }

    fn presented(&mut self, window: &WindowKey, now: Instant) -> Option<(WindowKey, Duration)> {
        let probe = self.windows.get_mut(window)?;
        probe
            .entered
            .take()
            .map(|entered| (window.clone(), now.saturating_duration_since(entered)))
    }
}

/// Begins timing visible host work before the native event loop can render it.
pub(crate) fn mark_commit_for_presentation(window: &WindowKey) {
    PROBE
        .get_or_init(Mutex::default)
        .lock()
        .expect("probe lock")
        .mark(window, Instant::now());
}

/// Cancels a timing marker when its host transaction was rejected or disconnected.
pub(crate) fn discard_commit_for_presentation(window: &WindowKey) {
    PROBE
        .get_or_init(Mutex::default)
        .lock()
        .expect("probe lock")
        .discard(window);
}

/// Updates visibility or returns a queued-to-render sample for this event's window.
pub(super) fn observe_presentation(event: &RuntimeEvent) -> Option<(WindowKey, Duration)> {
    PROBE
        .get_or_init(Mutex::default)
        .lock()
        .expect("probe lock")
        .observe(event, Instant::now())
}
