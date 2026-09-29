use super::*;
use argui_core::{Key, KeyInput, KeyState, Modifiers};

fn window(state: &mut RegionState, registry: &ServiceRegistry, event: PlatformEvent) -> AppUpdate {
    state.update(
        &AppEvent::Window {
            window: WindowKey::new("region"),
            event,
        },
        registry,
    )
}

#[test]
fn only_pressed_escape_or_enter_can_finish_a_region() {
    let registry = ServiceRegistry::new();
    let mut state = overlay(Some(CROP));
    for key in [Key::Escape, Key::Enter, Key::Other] {
        let update = window(
            &mut state,
            &registry,
            PlatformEvent::Keyboard(KeyInput {
                key,
                state: KeyState::Released,
                modifiers: Modifiers::default(),
                repeat: false,
                text: None,
            }),
        );
        assert!(update.commands.is_empty());
        assert!(state.open);
    }
    let update = window(
        &mut state,
        &registry,
        PlatformEvent::Keyboard(KeyInput {
            key: Key::Other,
            state: KeyState::Pressed,
            modifiers: Modifiers::default(),
            repeat: false,
            text: None,
        }),
    );
    assert!(update.commands.is_empty());
    assert!(state.open);
    let update = window(
        &mut state,
        &registry,
        PlatformEvent::Keyboard(KeyInput {
            key: Key::Escape,
            state: KeyState::Pressed,
            modifiers: Modifiers::default(),
            repeat: false,
            text: None,
        }),
    );
    assert_hidden(&update);
    assert!(!state.open);
}

#[test]
fn invalid_host_messages_and_unrelated_windows_do_not_change_selection() {
    let registry = ServiceRegistry::new();
    let mut state = overlay(Some(CROP));
    for value in ["invalid", "{}", r#"{"type":"unknown"}"#] {
        assert!(message(&mut state, &registry, value).commands.is_empty());
    }
    let update = state.update(
        &AppEvent::HostMessage {
            window: WindowKey::new("settings"),
            message: r#"{"type":"cancel"}"#.into(),
        },
        &registry,
    );
    assert!(update.commands.is_empty());
    assert_eq!(state.crop, Some(CROP));
    assert!(state.open);
}

#[test]
fn viewport_resize_constrains_a_crop_in_logical_units_and_ignores_zero_size() {
    let registry = ServiceRegistry::new();
    let mut state = overlay(Some(CROP));
    state.pixel_scale = 2.0;
    let update = window(
        &mut state,
        &registry,
        PlatformEvent::Resized {
            width: 400,
            height: 200,
        },
    );
    assert_eq!(state.viewport, Size::new(200.0, 100.0));
    let crop = state.crop.unwrap();
    assert!(crop.origin.x + crop.size.width <= 200.0);
    assert!(crop.origin.y + crop.size.height <= 100.0);
    assert!(!update.commands.is_empty());
    for (width, height) in [(0, 200), (400, 0)] {
        window(
            &mut state,
            &registry,
            PlatformEvent::Resized { width, height },
        );
        assert_eq!(state.viewport, Size::new(200.0, 100.0));
        assert_eq!(state.crop, Some(crop));
    }
}

#[test]
fn closed_region_ignores_window_input_and_malformed_controls_revision() {
    let registry = ServiceRegistry::new();
    let mut state = overlay(Some(CROP));
    state.open = false;
    window(
        &mut state,
        &registry,
        PlatformEvent::Resized {
            width: 100,
            height: 100,
        },
    );
    assert_eq!(state.viewport, Size::new(800.0, 600.0));
    assert!(
        message(&mut state, &registry, r#"{"type":"present","revision":10}"#)
            .commands
            .is_empty()
    );
}
