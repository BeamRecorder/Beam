use super::services::{ServiceOutcome, ServiceResponse};
use super::{ServiceRegistry, region::RegionState};
use argui_core::PointerPhase::{Cancelled, Moved, Pressed, Released};
use argui_core::{Point, PointerButton, PointerEvent, PointerPhase, Rect, Size};
use argui_core::{PointerId, PointerKind};
use argui_platform::{PlatformEvent, WindowInputRegion, WindowKey};
use argui_runtime::NativeMonitorInfo;
use argui_runtime::{AppCommand, AppEvent, AppUpdate, ViewUpdate};
use std::sync::mpsc::{self, Receiver, TryRecvError};

const CROP: Rect = rect(100.0, 80.0, 300.0, 200.0);

/// Builds a crop using native UI coordinates.
const fn rect(x: f32, y: f32, width: f32, height: f32) -> Rect {
    Rect::new(Point::new(x, y), Size::new(width, height))
}

/// Creates an active native overlay using UI coordinates independently of DPI.
fn overlay(crop: Option<Rect>) -> RegionState {
    let mut state = RegionState::default();
    state.created = true;
    state.open = true;
    state.viewport = Size::new(800.0, 600.0);
    state.input_holes = true;
    state.crop = crop;
    state.revision = 10;
    state
}

/// Produces a mouse sample with realistic primary-button transition metadata.
fn mouse(phase: PointerPhase, x: f32, y: f32) -> PointerEvent {
    PointerEvent {
        button: matches!(phase, Pressed | Released).then_some(PointerButton::Primary),
        buttons: u16::from(matches!(phase, Pressed | Moved)),
        ..PointerEvent::mouse(phase, Point::new(x, y))
    }
}

/// Exercises the same platform-event route as the native region window.
fn sample(state: &mut RegionState, registry: &ServiceRegistry, pointer: PointerEvent) -> AppUpdate {
    state.update(
        &AppEvent::Window {
            window: WindowKey::new("region"),
            event: PlatformEvent::Pointer(pointer),
        },
        registry,
    )
}

/// Sends the public JSON wire message without bypassing model routing.
fn message(state: &mut RegionState, registry: &ServiceRegistry, json: &str) -> AppUpdate {
    state.update(
        &AppEvent::HostMessage {
            window: WindowKey::new("region"),
            message: json.into(),
        },
        registry,
    )
}

fn assert_shape(update: &AppUpdate, region: WindowInputRegion) {
    assert!(update.commands.contains(&AppCommand::SetWindowInputRegion {
        window: WindowKey::new("region"),
        region,
    }));
}

fn assert_hidden(update: &AppUpdate) {
    for key in ["region", "regionControls", "regionActions"] {
        assert!(
            update
                .commands
                .contains(&AppCommand::HideWindow(WindowKey::new(key)))
        );
    }
}

/// Observes routed events synchronously; model updates do not need worker threads.
fn event_registry() -> (
    ServiceRegistry,
    Receiver<ServiceResponse>,
    Receiver<ServiceResponse>,
) {
    let registry = ServiceRegistry::default();
    let (main_sender, main) = mpsc::channel();
    let (controls_sender, controls) = mpsc::channel();
    registry.register_session(1, "main", main_sender);
    registry.register_session(2, "regionControls", controls_sender);
    (registry, main, controls)
}

#[test]
fn native_draw_uses_release_position_and_restores_the_inset_input_hole() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(None);
    let press = sample(&mut state, &registry, mouse(Pressed, 100.0, 80.0));
    assert_shape(&press, WindowInputRegion::Full);
    for key in ["regionControls", "regionActions"] {
        assert!(
            press
                .commands
                .contains(&AppCommand::HideWindow(WindowKey::new(key)))
        );
    }
    assert!(!state.snapshot().selected);
    assert!(!state.snapshot().can_record);

    let motion = sample(&mut state, &registry, mouse(Moved, 300.0, 220.0));
    assert_eq!(state.crop, Some(rect(100.0, 80.0, 200.0, 140.0)));
    assert!(motion.commands.is_empty());
    assert!(motion.windows.iter().any(|invalidation| {
        invalidation.window == WindowKey::new("region")
            && invalidation.update == ViewUpdate::Rebuild
    }));

    let release = sample(&mut state, &registry, mouse(Released, 420.0, 260.0));
    assert_eq!(state.crop, Some(rect(100.0, 80.0, 320.0, 180.0)));
    assert!(state.snapshot().selected);
    assert_shape(
        &release,
        WindowInputRegion::Exclude(rect(108.0, 88.0, 304.0, 164.0)),
    );
    assert!(state.snapshot().selected);
    assert!(state.snapshot().can_record);
}

#[test]
fn native_move_from_the_border_clamps_without_accumulating_motion_or_resizing() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    sample(&mut state, &registry, mouse(Pressed, 106.0, 160.0));
    sample(&mut state, &registry, mouse(Moved, 706.0, 660.0));
    assert_eq!(
        state.crop,
        Some(Rect::new(Point::new(500.0, 400.0), CROP.size))
    );
    sample(&mut state, &registry, mouse(Released, 116.0, 165.0));
    assert_eq!(
        state.crop,
        Some(Rect::new(Point::new(110.0, 85.0), CROP.size))
    );
    assert!(state.snapshot().selected);
}

#[test]
fn native_resize_routes_each_corner_and_keeps_its_opposite_anchor() {
    let registry = ServiceRegistry::default();
    for (_corner, press, at, expected) in [
        (
            "Nw",
            Point::new(100.0, 80.0),
            Point::new(40.0, 30.0),
            rect(40.0, 30.0, 360.0, 250.0),
        ),
        (
            "Ne",
            Point::new(400.0, 80.0),
            Point::new(500.0, 40.0),
            rect(100.0, 40.0, 400.0, 240.0),
        ),
        (
            "Sw",
            Point::new(100.0, 280.0),
            Point::new(40.0, 350.0),
            rect(40.0, 80.0, 360.0, 270.0),
        ),
        (
            "Se",
            Point::new(400.0, 280.0),
            Point::new(500.0, 350.0),
            rect(100.0, 80.0, 400.0, 270.0),
        ),
    ] {
        let mut state = overlay(Some(CROP));
        sample(&mut state, &registry, mouse(Pressed, press.x, press.y));
        sample(&mut state, &registry, mouse(Moved, at.x, at.y));
        sample(&mut state, &registry, mouse(Released, at.x, at.y));
        assert_eq!(state.crop, Some(expected));
        assert!(state.snapshot().selected);
    }
}

#[test]
fn native_cancel_restores_the_previous_crop_or_the_empty_overlay() {
    let registry = ServiceRegistry::default();
    for previous in [Some(CROP), None] {
        let mut state = overlay(previous);
        sample(&mut state, &registry, mouse(Pressed, 600.0, 400.0));
        sample(&mut state, &registry, mouse(Moved, 700.0, 500.0));
        let cancel = sample(&mut state, &registry, mouse(Cancelled, 799.0, 599.0));
        assert_eq!(state.crop, previous);
        assert_eq!(state.snapshot().selected, previous.is_some());
        assert!(state.open);
        let policy = if previous.is_some() {
            WindowInputRegion::Exclude(rect(108.0, 88.0, 284.0, 184.0))
        } else {
            WindowInputRegion::Full
        };
        assert_shape(&cancel, policy);
    }
}

#[test]
fn native_middle_release_does_not_end_or_move_the_primary_drag() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    sample(&mut state, &registry, mouse(Pressed, 150.0, 160.0));
    let revision = state.revision;
    let release = PointerEvent {
        button: Some(PointerButton::Middle),
        buttons: 1,
        ..mouse(Released, 750.0, 550.0)
    };
    assert_eq!(sample(&mut state, &registry, release), AppUpdate::none());
    assert_eq!(state.crop, Some(CROP));
    assert_eq!(state.revision, revision);
    assert!(!state.snapshot().selected);
    sample(&mut state, &registry, mouse(Released, 160.0, 170.0));
    assert!(state.snapshot().selected);
    assert_eq!(
        state.crop,
        Some(Rect::new(Point::new(110.0, 90.0), CROP.size))
    );
}

#[test]
fn native_other_contact_cannot_replace_move_release_or_cancel_the_active_drag() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    sample(&mut state, &registry, mouse(Pressed, 150.0, 160.0));
    let revision = state.revision;
    for phase in [Pressed, Moved, Released, Cancelled] {
        let contact = PointerEvent {
            id: PointerId::new(7),
            kind: PointerKind::Touch,
            primary: false,
            ..mouse(phase, 700.0, 500.0)
        };
        assert_eq!(sample(&mut state, &registry, contact), AppUpdate::none());
        assert_eq!(state.crop, Some(CROP));
        assert_eq!(state.revision, revision);
        assert!(!state.snapshot().selected);
    }
    sample(&mut state, &registry, mouse(Released, 160.0, 170.0));
    assert!(state.snapshot().selected);
}

#[test]
fn native_late_preset_is_ignored_without_mutating_an_active_drag_or_its_shape() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    sample(&mut state, &registry, mouse(Pressed, 150.0, 160.0));
    sample(&mut state, &registry, mouse(Moved, 113.0, 170.0));
    let crop = state.crop;
    let revision = state.revision;
    let update = message(
        &mut state,
        &registry,
        r#"{"action":"preset","value":"9:16"}"#,
    );
    assert_eq!(update, AppUpdate::none());
    assert_eq!(state.crop, crop);
    assert_eq!(state.revision, revision);
    assert_eq!(state.preset, "free");
    assert!(!state.snapshot().selected);
}

#[test]
fn snapshot_keeps_small_ratio_crops_selected_but_uses_ui_units_for_record_validity() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(rect(100.0, 576.0, 300.0, 24.0)));
    state.pixel_scale = 2.0;
    message(
        &mut state,
        &registry,
        r#"{"action":"preset","value":"9:16"}"#,
    );
    assert_eq!(state.crop, Some(rect(100.0, 576.0, 13.5, 24.0)));
    let snapshot = state.snapshot();
    assert!(snapshot.selected);
    assert!(!snapshot.can_record);
    assert_eq!((snapshot.width, snapshot.height), (27, 48));
    state.crop = Some(rect(100.0, 80.0, 24.0, 24.0));
    assert!(state.snapshot().can_record);
    state.open = false;
    assert!(!state.snapshot().selected);
    assert!(!state.snapshot().can_record);
}

#[test]
fn native_confirm_routes_bounds_and_keeps_a_passive_mask_without_selection_controls() {
    let (registry, main, controls) = event_registry();
    let mut state = overlay(Some(CROP));
    state.pixel_scale = 2.0;
    state.monitor = Some(NativeMonitorInfo {
        name: Some("Scaled monitor".into()),
        x: -1600,
        y: 200,
        width: 1600,
        height: 1200,
        scale_factor: 2.0,
        primary: true,
    });
    let update = message(&mut state, &registry, r#"{"action":"confirm"}"#);
    assert_shape(&update, WindowInputRegion::PassThrough);
    assert!(
        !update
            .commands
            .contains(&AppCommand::HideWindow(WindowKey::new("region")))
    );
    for key in ["regionControls", "regionActions"] {
        assert!(
            update
                .commands
                .contains(&AppCommand::HideWindow(WindowKey::new(key)))
        );
    }
    assert!(!state.open);
    assert!(state.passive);
    assert!(!state.snapshot().selected);
    let response = main.try_recv().expect("main receives the confirmed crop");
    assert_eq!(response.window, "main");
    assert_eq!(response.request_id, 0);
    let ServiceOutcome::Event(value) = response.outcome else {
        panic!("confirmation must publish an event");
    };
    assert_eq!(
        value,
        serde_json::json!({
            "type": "beamUi", "action": "regionSelected",
            "region": { "x": 0.125, "y": 80.0 / 600.0, "width": 0.375, "height": 200.0 / 600.0 }
        })
    );
    assert!(controls.try_iter().all(|event| {
        !matches!(event.outcome, ServiceOutcome::Event(value) if value["type"] == "beamUi")
    }));
}

#[test]
fn native_invalid_confirm_keeps_the_overlay_open_without_hiding_or_emitting_capture() {
    let (registry, main, _) = event_registry();
    for crop in [
        None,
        Some(rect(100.0, 80.0, 23.5, 100.0)),
        Some(rect(100.0, 80.0, 100.0, 23.5)),
    ] {
        let mut state = overlay(crop);
        let revision = state.revision;
        assert_eq!(
            message(&mut state, &registry, r#"{"action":"confirm"}"#),
            AppUpdate::none()
        );
        assert!(state.open);
        assert_eq!(state.crop, crop);
        assert_eq!(state.revision, revision);
        assert!(!state.snapshot().can_record);
        assert!(matches!(main.try_recv(), Err(TryRecvError::Empty)));
    }
}

#[test]
fn native_host_cancel_emits_no_bounds_and_hides_every_crop_window() {
    let (registry, main, _) = event_registry();
    let mut state = overlay(Some(CROP));
    let update = message(&mut state, &registry, r#"{"action":"cancel"}"#);
    assert_hidden(&update);
    assert!(!state.open);
    let response = main.try_recv().expect("main receives cancellation");
    let ServiceOutcome::Event(value) = response.outcome else {
        panic!("cancellation must publish an event");
    };
    assert_eq!(
        value,
        serde_json::json!({"type": "beamUi", "action": "regionCanceled"})
    );
}

#[test]
fn native_pointer_events_for_other_windows_or_a_closed_overlay_are_ignored() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    let event = AppEvent::Window {
        window: WindowKey::main(),
        event: PlatformEvent::Pointer(mouse(Pressed, 600.0, 400.0)),
    };
    assert_eq!(state.update(&event, &registry), AppUpdate::none());
    assert_eq!(state.crop, Some(CROP));
    assert!(state.snapshot().selected);
    state.open = false;
    assert_eq!(
        sample(&mut state, &registry, mouse(Pressed, 600.0, 400.0)),
        AppUpdate::none()
    );
    assert_eq!(state.crop, Some(CROP));
    assert!(!state.snapshot().selected);
}

#[test]
fn native_grabbing_inside_a_corner_handle_does_not_jump_and_preserves_the_grip_offset() {
    let registry = ServiceRegistry::default();
    for (press, at, expected) in [
        (
            Point::new(103.0, 82.0),
            Point::new(43.0, 32.0),
            rect(40.0, 30.0, 360.0, 250.0),
        ),
        (
            Point::new(397.0, 277.0),
            Point::new(497.0, 347.0),
            rect(100.0, 80.0, 400.0, 270.0),
        ),
        (
            Point::new(398.0, 83.0),
            Point::new(498.0, 43.0),
            rect(100.0, 40.0, 400.0, 240.0),
        ),
    ] {
        let mut state = overlay(Some(CROP));
        sample(&mut state, &registry, mouse(Pressed, press.x, press.y));
        assert_eq!(state.crop, Some(CROP));
        sample(&mut state, &registry, mouse(Released, at.x, at.y));
        assert_eq!(state.crop, Some(expected));
    }
}

#[test]
fn native_dpi_changes_keep_physical_crop_pixels_and_restore_the_input_hole() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    let update = state.update(
        &AppEvent::Window {
            window: WindowKey::new("region"),
            event: PlatformEvent::ScaleFactorChanged(1.25),
        },
        &registry,
    );
    assert_eq!(state.crop, Some(rect(80.0, 64.0, 240.0, 160.0)));
    assert_eq!(
        (state.snapshot().width, state.snapshot().height),
        (300, 200)
    );
    assert_shape(
        &update,
        WindowInputRegion::Exclude(rect(88.0, 72.0, 224.0, 144.0)),
    );
}

#[test]
fn native_dpi_changes_cancel_drag_before_rescaling_the_committed_crop() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    sample(&mut state, &registry, mouse(Pressed, 100.0, 80.0));
    sample(&mut state, &registry, mouse(Moved, 30.0, 20.0));
    state.update(
        &AppEvent::Window {
            window: WindowKey::new("region"),
            event: PlatformEvent::ScaleFactorChanged(2.0),
        },
        &registry,
    );
    assert!(state.snapshot().selected);
    assert_eq!(state.crop, Some(rect(50.0, 40.0, 150.0, 100.0)));
    assert!(state.images().is_empty());
}

#[test]
fn native_dpi_ignores_invalid_and_unchanged_scale_samples() {
    let registry = ServiceRegistry::default();
    let mut state = overlay(Some(CROP));
    for scale in [0.0, -1.0, f64::NAN, f64::INFINITY, 1.0] {
        assert_eq!(
            state.update(
                &AppEvent::Window {
                    window: WindowKey::new("region"),
                    event: PlatformEvent::ScaleFactorChanged(scale)
                },
                &registry
            ),
            AppUpdate::none()
        );
        assert_eq!(state.crop, Some(CROP));
    }
}

#[path = "pointer_lifecycle.rs"]
mod lifecycle;

#[path = "events.rs"]
mod events;
