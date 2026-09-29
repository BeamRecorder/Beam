#![cfg(test)]
#![allow(clippy::unwrap_used)]

#[cfg(target_os = "linux")]
#[test]
#[ignore = "requires the private X11 display"]
fn desktop_preview_rejects_unresolved_sources() {
    assert_eq!(std::env::var("ARGUI_HIDDEN_DISPLAY").as_deref(), Ok("1"));
    let id = crate::model::SourceId::new("portal:window").unwrap();
    assert!(super::window_bounds(&id).is_err());
    assert!(super::raise_window(&id).is_err());
    assert!(super::activate_window(&id).is_err());
}

#[path = "desktop/appearance.rs"]
mod appearance;
