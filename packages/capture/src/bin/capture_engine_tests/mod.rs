use capture::{
    catalog::CatalogSnapshot,
    model::{CaptureCapabilities, PermissionSnapshot},
};

use super::{Engine, prepare_snapshot};

#[cfg(target_os = "linux")]
#[test]
fn prepare_reuses_the_successful_portal_discovery_snapshot() -> Result<(), capture::CaptureError> {
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
        diagnostics: Default::default(),
        limitations: vec!["discovered once".into()],
        sources: Vec::new(),
    };
    let mut engine = Engine {
        last_portal_snapshot: Some(discovered.clone()),
        ..Engine::default()
    };

    let prepared = prepare_snapshot(&mut engine)?;

    assert_eq!(prepared, discovered);
    Ok(())
}
