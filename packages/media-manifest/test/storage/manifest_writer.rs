#![allow(clippy::expect_used)]

#[path = "../support.rs"]
mod support;

use beam_media_manifest::{
    ManifestError, ManifestWriter, ProjectId, ProjectLayout, SessionId, SessionManifest,
};
use support::sample_manifest;

#[test]
fn checkpoint_and_finalize_replace_partial_manifest() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project = ProjectId::new();
    let session = SessionId::new();
    let layout = ProjectLayout::new(temporary.path(), project).session(session);
    layout.create().expect("layout");
    let mut manifest = sample_manifest(project, session);
    let mut writer = ManifestWriter::new(layout.clone());
    writer.checkpoint(&manifest).expect("checkpoint");
    assert!(layout.partial_manifest().exists());
    writer.finalize(&mut manifest).expect("finalize");
    assert!(manifest.completed);
    assert!(!layout.partial_manifest().exists());
    let stored: SessionManifest =
        serde_json::from_slice(&std::fs::read(layout.manifest()).expect("read")).expect("JSON");
    assert!(stored.completed);
    writer.finalize(&mut manifest).expect("idempotent");
}

#[test]
fn failed_finalize_preserves_in_memory_incomplete_state() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project = ProjectId::new();
    let session = SessionId::new();
    let layout = ProjectLayout::new(temporary.path(), project).session(session);
    let mut manifest = sample_manifest(project, session);
    let mut writer = ManifestWriter::new(layout);
    assert!(matches!(
        writer.finalize(&mut manifest),
        Err(ManifestError::Storage { .. })
    ));
    assert!(!manifest.completed);
}

#[test]
fn incomplete_capture_can_finalize_without_claiming_success() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project = ProjectId::new();
    let session = SessionId::new();
    let layout = ProjectLayout::new(temporary.path(), project).session(session);
    layout.create().expect("layout");
    let mut manifest = sample_manifest(project, session);
    let mut writer = ManifestWriter::new(layout.clone());
    writer
        .finalize_with_completion(&mut manifest, false)
        .expect("incomplete finalize");
    let stored: SessionManifest =
        serde_json::from_slice(&std::fs::read(layout.manifest()).expect("read")).expect("JSON");
    assert!(!manifest.completed);
    assert!(!stored.completed);
}

#[test]
fn blocked_checkpoint_path_does_not_hide_an_incomplete_final_manifest() {
    let temporary = tempfile::tempdir().expect("tempdir");
    let project = ProjectId::new();
    let session = SessionId::new();
    let layout = ProjectLayout::new(temporary.path(), project).session(session);
    layout.create().expect("layout");
    let mut manifest = sample_manifest(project, session);
    let mut writer = ManifestWriter::new(layout.clone());
    std::fs::create_dir(layout.partial_manifest()).expect("block checkpoint path");

    writer
        .finalize_with_completion(&mut manifest, false)
        .expect("final manifest remains publishable");
    let stored: SessionManifest =
        serde_json::from_slice(&std::fs::read(layout.manifest()).expect("read"))
            .expect("manifest JSON");
    assert!(!stored.completed);
    assert!(layout.partial_manifest().is_dir());
}
