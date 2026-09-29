//! Brings Beam's open native windows back together on application activation.

use argui_platform::PlatformEvent;
use argui_runtime::{AppCommand, AppEvent, AppUpdate};

/// Adds grouped restoration only for real focus gain, preserving other effects.
/// Native stacking retains the selected window's focus and excludes hidden scenes.
pub(crate) fn restore_open_windows(event: &AppEvent, mut update: AppUpdate) -> AppUpdate {
    if let AppEvent::Window {
        window,
        event: PlatformEvent::Focused(true),
    } = event
    {
        update
            .commands
            .push(AppCommand::RaiseOpenWindows(window.clone()));
    }
    update
}
