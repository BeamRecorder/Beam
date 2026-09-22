#![allow(clippy::expect_used)]

use capture::{
    catalog::CatalogSnapshot,
    model::{
        CaptureCapabilities, PermissionSnapshot, SourceCapabilities, SourceDescriptor, SourceId,
        SourceKind, SourceSelectionMode,
    },
};

#[test]
fn old_catalog_without_diagnostics_remains_readable_and_filters_sources() {
    let snapshot = CatalogSnapshot {
        generation: 1,
        created_at_utc: "2026-01-01T00:00:00Z".into(),
        capabilities: CaptureCapabilities::default(),
        permissions: PermissionSnapshot::default(),
        diagnostics: Default::default(),
        limitations: Vec::new(),
        sources: vec![SourceDescriptor {
            id: SourceId::new("display:1").expect("ID"),
            kind: SourceKind::Display,
            label: "Display".into(),
            is_default: true,
            selection_mode: SourceSelectionMode::Direct,
            display_id: None,
            capabilities: SourceCapabilities::default(),
        }],
    };
    let mut json = serde_json::to_value(snapshot).expect("serialize");
    json.as_object_mut().expect("object").remove("diagnostics");
    let restored: CatalogSnapshot = serde_json::from_value(json).expect("old snapshot");
    assert_eq!(restored.diagnostics, Default::default());
    assert_eq!(restored.by_kind(SourceKind::Display).count(), 1);
    assert_eq!(restored.by_kind(SourceKind::Window).count(), 0);
}
