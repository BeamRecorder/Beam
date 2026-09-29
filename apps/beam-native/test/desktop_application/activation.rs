#[path = "../../src/desktop_application/activation.rs"]
mod activation;

use argui_platform::{PlatformEvent, WindowKey};
use argui_runtime::{AppCommand, AppEvent, AppUpdate};

#[test]
fn focusing_each_window_restores_the_open_group_without_losing_other_commands() {
    for name in ["main", "settings", "recorder", "teleprompter", "region"] {
        let window = WindowKey::new(name);
        let event = AppEvent::Window {
            window: window.clone(),
            event: PlatformEvent::Focused(true),
        };
        let update = AppUpdate::none().command(AppCommand::SetWindowTitle {
            window: window.clone(),
            title: "Beam".into(),
        });
        let updated = activation::restore_open_windows(&event, update.clone());
        assert_eq!(updated.commands[0], update.commands[0]);
        assert_eq!(updated.commands[1], AppCommand::RaiseOpenWindows(window));
    }
}

#[test]
fn blur_visibility_and_close_events_do_not_restore_other_windows() {
    for event in [
        PlatformEvent::Focused(false),
        PlatformEvent::VisibilityChanged(true),
        PlatformEvent::VisibilityChanged(false),
        PlatformEvent::CloseRequested,
        PlatformEvent::Closed,
    ] {
        assert_eq!(
            activation::restore_open_windows(
                &AppEvent::Window {
                    window: WindowKey::main(),
                    event
                },
                AppUpdate::none()
            ),
            AppUpdate::none()
        );
    }
}

#[test]
fn unrelated_events_preserve_the_original_update() {
    let update = AppUpdate::none().command(AppCommand::Quit);
    assert_eq!(
        activation::restore_open_windows(
            &AppEvent::WindowReady {
                window: WindowKey::main()
            },
            update.clone()
        ),
        update
    );
}
