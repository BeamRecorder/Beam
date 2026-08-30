use capture::protocol::{Command, RequestEnvelope};
#[cfg(target_os = "linux")]
use capture::{
    catalog::CatalogSnapshot,
    model::{CaptureCapabilities, PermissionSnapshot},
};

#[cfg(target_os = "linux")]
use super::prepare_snapshot;
use super::{Engine, handle};

#[test]
fn idle_status_reports_screen_available() {
    let mut engine = Engine::default();
    let response = handle(
        RequestEnvelope {
            id: "status-idle".into(),
            command: Command::Status,
        },
        &mut engine,
    );

    assert!(response.ok);
    assert_eq!(
        response
            .result
            .as_ref()
            .and_then(|result| result.get("screenAvailable"))
            .and_then(serde_json::Value::as_bool),
        Some(true)
    );
}

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
