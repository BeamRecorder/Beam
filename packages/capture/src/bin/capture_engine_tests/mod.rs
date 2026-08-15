use capture::{
    catalog::CatalogSnapshot,
    model::{CaptureCapabilities, PermissionSnapshot},
};

use super::{Engine, prepare_snapshot};

#[cfg(target_os = "linux")]
#[test]
fn prepare_reuses_the_successful_portal_discovery_snapshot() {
    let discovered = CatalogSnapshot {
        generation: 42,
        created_at_utc: "2026-08-15T00:00:00Z".into(),
        capabilities: CaptureCapabilities {
            display_capture: true,
            window_capture: true,
            portal_selection: true,
            ..CaptureCapabilities::default()
        },
        permissions: PermissionSnapshot::default(),
        limitations: vec!["discovered once".into()],
        sources: Vec::new(),
    };
    let mut engine = Engine::default();
    engine.last_portal_snapshot = Some(discovered.clone());

    let prepared = prepare_snapshot(&mut engine).expect("cached Portal snapshot");

    assert_eq!(prepared, discovered);
}
