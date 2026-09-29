#[path = "../../src/telemetry/presentation.rs"]
#[allow(dead_code)]
mod implementation;
use argui_platform::{PlatformEvent, WindowKey};
use argui_runtime::{RuntimeEvent, WindowRuntimeEvent};
use implementation::PresentationProbe;
use std::time::{Duration, Instant};

fn rendered(window: WindowKey) -> RuntimeEvent {
    RuntimeEvent::Window {
        window,
        event: WindowRuntimeEvent::RenderProfile(Box::default()),
    }
}
fn visible(window: WindowKey, visible: bool) -> RuntimeEvent {
    RuntimeEvent::Window {
        window,
        event: WindowRuntimeEvent::Platform(PlatformEvent::VisibilityChanged(visible)),
    }
}

#[test]
fn rendering_before_the_relay_acknowledgement_cannot_leave_a_stale_marker() {
    let mut probe = PresentationProbe::default();
    let window = WindowKey::main();
    let now = Instant::now();
    probe.mark(&window, now);
    assert_eq!(
        probe
            .observe(&rendered(window.clone()), now + Duration::from_millis(5))
            .unwrap()
            .1,
        Duration::from_millis(5)
    );
    assert!(
        probe
            .observe(&rendered(window), now + Duration::from_secs(1))
            .is_none()
    );
}

#[test]
fn independent_windows_do_not_consume_each_others_pending_commits() {
    let mut probe = PresentationProbe::default();
    let now = Instant::now();
    let settings = WindowKey::new("settings");
    probe.observe(&visible(settings.clone(), true), now);
    probe.mark(&WindowKey::main(), now);
    probe.mark(&settings, now + Duration::from_millis(10));
    assert_eq!(
        probe.observe(&rendered(settings.clone()), now + Duration::from_millis(20)),
        Some((settings, Duration::from_millis(10)))
    );
    assert_eq!(
        probe
            .observe(
                &RuntimeEvent::RenderProfile(Box::default()),
                now + Duration::from_millis(30)
            )
            .unwrap()
            .1,
        Duration::from_millis(30)
    );
}

#[test]
fn hidden_prewarming_and_hide_restore_are_not_interaction_samples() {
    let mut probe = PresentationProbe::default();
    let now = Instant::now();
    let window = WindowKey::new("settings");
    probe.mark(&window, now);
    assert!(
        probe
            .observe(&rendered(window.clone()), now + Duration::from_secs(1))
            .is_none()
    );
    probe.observe(&visible(window.clone(), true), now);
    probe.mark(&window, now);
    probe.observe(&visible(window.clone(), false), now);
    probe.observe(
        &visible(window.clone(), true),
        now + Duration::from_secs(20),
    );
    assert!(
        probe
            .observe(&rendered(window), now + Duration::from_secs(20))
            .is_none()
    );
}

#[test]
fn repeated_batches_keep_the_oldest_pending_time_and_failed_work_is_discarded() {
    let mut probe = PresentationProbe::default();
    let window = WindowKey::main();
    let now = Instant::now();
    probe.mark(&window, now);
    probe.mark(&window, now + Duration::from_millis(10));
    assert_eq!(
        probe
            .observe(&rendered(window.clone()), now + Duration::from_millis(15))
            .unwrap()
            .1,
        Duration::from_millis(15)
    );
    probe.mark(&window, now);
    probe.discard(&window);
    assert!(
        probe
            .observe(&rendered(window), now + Duration::from_secs(1))
            .is_none()
    );
    probe.discard(&WindowKey::new("unmounted"));
}
