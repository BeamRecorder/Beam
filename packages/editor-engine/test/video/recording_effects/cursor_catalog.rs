use beam_editor_domain::recording::cursor_style_types::{CursorSelection, SelectionMode};
use beam_editor_engine::video::recording_effects::cursor_catalog::{self, bytes, packs, resolve};
#[test]
fn original_catalogue_and_assets_are_embedded_with_real_hotspots() {
    let packs = packs().unwrap();
    assert!(packs.len() > 5);
    let mac = packs.iter().find(|p| p.id == "builtin:macos").unwrap();
    assert_eq!(mac.cursors.len(), 35);
    for art in &mac.cursors {
        assert!(!bytes(mac, art).unwrap().is_empty());
        assert!(art.hotspot.x >= 0. && art.hotspot.y >= 0.);
    }
    let summaries = serde_json::to_string(&cursor_catalog::summaries().unwrap()).unwrap();
    assert!(!summaries.contains("url"));
    assert!(!summaries.contains("project-media"));
}
#[test]
fn captured_roles_change_artwork_and_fixed_selection_stays_fixed() {
    let packs = packs().unwrap();
    let mac = packs.iter().find(|p| p.id == "builtin:macos").unwrap();
    let mut selection = CursorSelection::default();
    for role in [
        "default",
        "textcursor",
        "handpointing",
        "handgrabbing",
        "resizenorthsouth",
    ] {
        let art = resolve(mac, &selection, Some(role)).unwrap();
        assert_eq!(art.id, role);
    }
    assert_eq!(
        resolve(mac, &selection, Some("unknown")).unwrap().id,
        mac.default_cursor_id
    );
    selection.mode = SelectionMode::Fixed;
    selection.cursor_id = Some("textcursor".into());
    assert_eq!(
        resolve(mac, &selection, Some("handpointing")).unwrap().id,
        "textcursor"
    );
    selection.cursor_id = Some("missing".into());
    assert!(resolve(mac, &selection, None).is_err());
}
#[test]
fn malformed_imported_pack_is_reported_and_a_second_library_cannot_replace_the_host_path() {
    let root = tempfile::tempdir().unwrap();
    cursor_catalog::configure_library(root.path().into()).unwrap();
    cursor_catalog::configure_library(root.path().into()).unwrap();
    assert!(cursor_catalog::configure_library(root.path().join("other")).is_err());
    let folder = root.path().join("a".repeat(64));
    std::fs::create_dir(&folder).unwrap();
    std::fs::write(folder.join("pack.json"), b"{}").unwrap();
    assert!(packs().is_err());
}
