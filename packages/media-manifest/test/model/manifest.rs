#![allow(clippy::expect_used)]

#[path = "../support.rs"]
mod support;

use beam_media_manifest::{ProjectId, SessionId, SessionManifest};
use support::sample_manifest;

#[test]
fn v2_manifest_round_trips_with_identical_json() {
    let manifest = sample_manifest(ProjectId::new(), SessionId::new());
    let json = serde_json::to_value(&manifest).expect("serialize");
    assert_eq!(json["schemaVersion"], 2);
    assert_eq!(
        json["selectedSources"]["systemAudio"],
        serde_json::Value::Null
    );
    assert_eq!(
        serde_json::from_value::<SessionManifest>(json).expect("read v2"),
        manifest
    );
}

#[test]
fn old_v2_manifest_without_warnings_is_readable() {
    let original = sample_manifest(ProjectId::new(), SessionId::new());
    let mut json = serde_json::to_value(&original).expect("serialize");
    json.as_object_mut().expect("object").remove("warnings");
    let read: SessionManifest = serde_json::from_value(json).expect("old v2 manifest");
    assert!(read.warnings.is_empty());
    assert_eq!(read.project_id, original.project_id);
}
