use super::*;

#[test]
fn passive_mask_ignores_selection_input_and_dismisses_without_a_second_capture_action() {
    let (registry, main, _) = event_registry();
    let mut state = overlay(Some(CROP));
    message(&mut state, &registry, r#"{"action":"confirm"}"#);
    assert!(main.try_recv().is_ok());
    for phase in [Pressed, Moved, Released] {
        assert_eq!(
            sample(&mut state, &registry, mouse(phase, 750.0, 550.0)),
            AppUpdate::none()
        );
    }
    assert_eq!(state.crop, Some(CROP));
    let update = message(&mut state, &registry, r#"{"action":"cancel"}"#);
    assert!(
        update
            .commands
            .contains(&AppCommand::HideWindow(WindowKey::new("region")))
    );
    assert!(!state.passive && !state.open);
    assert!(main.try_recv().is_err());
    assert_eq!(
        message(&mut state, &registry, r#"{"action":"cancel"}"#),
        AppUpdate::none()
    );
}

#[test]
fn passive_mask_preserves_click_through_after_resize_and_dpi_changes() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    message(&mut state, &registry, r#"{"action":"confirm"}"#);
    for event in [
        PlatformEvent::ScaleFactorChanged(1.5),
        PlatformEvent::Resized {
            width: 1200,
            height: 900,
        },
    ] {
        let update = state.update(
            &AppEvent::Window {
                window: WindowKey::new("region"),
                event,
            },
            &registry,
        );
        assert_shape(&update, WindowInputRegion::PassThrough);
        assert!(state.passive && !state.open);
        assert!(
            !update
                .commands
                .iter()
                .any(|command| matches!(command, AppCommand::ShowWindow(_)))
        );
    }
}

#[test]
fn passive_mask_does_not_raise_itself_when_countdown_or_recorder_takes_focus() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    message(&mut state, &registry, r#"{"action":"confirm"}"#);
    let event = AppEvent::Window {
        window: WindowKey::new("region"),
        event: PlatformEvent::Focused(false),
    };
    assert_eq!(state.update(&event, &registry), AppUpdate::none());
}

#[test]
fn presets_update_a_settled_crop_without_hiding_or_refocusing_its_controls() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    for value in ["16:9", "1:1", "1280×720", "free"] {
        let revision = state.revision;
        let update = message(
            &mut state,
            &registry,
            &serde_json::json!({ "action": "preset", "value": value }).to_string(),
        );
        assert_eq!(state.preset, value);
        assert_eq!(state.revision, revision + 1);
        assert!(state.snapshot().selected);
        assert!(!update.commands.iter().any(|command| matches!(
            command,
            AppCommand::HideWindow(_) | AppCommand::ShowWindow(_) | AppCommand::FocusWindow(_)
        )));
        assert!(update.commands.iter().any(|command| matches!(command,
            AppCommand::SetWindowInputRegion { window, .. } if window.as_str() == "region")));
    }
}

#[test]
fn presenting_a_crop_reasserts_stacking_without_requesting_attention_or_focus() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    let update = message(
        &mut state,
        &registry,
        r#"{"action":"present","revision":10}"#,
    );
    for key in ["regionActions", "regionControls"] {
        assert!(
            update
                .commands
                .contains(&AppCommand::ShowWindow(WindowKey::new(key)))
        );
        assert!(update.commands.contains(&AppCommand::SetWindowLevel {
            window: WindowKey::new(key),
            level: argui_platform::WindowLevel::AlwaysOnTop,
        }));
    }
    assert!(
        !update
            .commands
            .iter()
            .any(|command| matches!(command, AppCommand::FocusWindow(_)))
    );
}

#[test]
fn native_focus_loss_restores_a_drag_and_does_not_dismiss_a_settled_selection() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    sample(&mut state, &registry, mouse(Pressed, 100.0, 80.0));
    sample(&mut state, &registry, mouse(Moved, 30.0, 20.0));
    let event = AppEvent::Window {
        window: WindowKey::new("region"),
        event: PlatformEvent::Focused(false),
    };
    state.update(&event, &registry);
    assert_eq!(state.crop, Some(CROP));
    assert!(state.open && state.snapshot().selected);
    assert_eq!(state.update(&event, &registry), AppUpdate::none());
}

#[test]
fn native_stale_placement_cannot_reopen_toolbar_during_drag_or_after_cancel() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    assert_eq!(
        message(
            &mut state,
            &registry,
            r#"{"action":"present","revision":9}"#
        ),
        AppUpdate::none()
    );
    sample(&mut state, &registry, mouse(Pressed, 100.0, 80.0));
    assert_eq!(
        message(
            &mut state,
            &registry,
            r#"{"action":"present","revision":10}"#
        ),
        AppUpdate::none()
    );
    message(&mut state, &registry, r#"{"action":"cancel"}"#);
    assert_eq!(
        message(
            &mut state,
            &registry,
            r#"{"action":"present","revision":12}"#
        ),
        AppUpdate::none()
    );
}

#[test]
fn native_confirm_preserves_the_selected_secondary_monitor_source() {
    let (registry, main, _) = event_registry();
    let mut state = overlay(Some(CROP));
    state.source_id = Some("x11:monitor:42:99".into());
    message(&mut state, &registry, r#"{"action":"confirm"}"#);
    let ServiceOutcome::Event(event) = main.try_recv().unwrap().outcome else {
        panic!("region event");
    };
    assert_eq!(event["sourceId"], "x11:monitor:42:99");
    assert!(state.images().is_empty());
}

#[test]
fn snapshot_places_controls_and_actions_with_monitor_origin_and_native_pixel_scale() {
    let mut state = overlay(Some(CROP));
    state.pixel_scale = 1.25;
    state.monitor = Some(NativeMonitorInfo {
        name: None,
        x: -1000,
        y: 200,
        width: 1000,
        height: 750,
        scale_factor: 1.25,
        primary: false,
    });
    let snapshot = state.snapshot();
    assert_eq!((snapshot.controls_x, snapshot.controls_y), (-875, 240));
    assert_eq!(
        (snapshot.controls_width, snapshot.controls_height),
        (300.0, 40.0)
    );
    assert_eq!((snapshot.actions_x, snapshot.actions_y), (-887, 858));
    assert_eq!(
        (snapshot.actions_width, snapshot.actions_height),
        (620.0, 54.0)
    );
}
