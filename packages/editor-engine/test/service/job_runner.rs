use beam_editor_engine::{
    Document,
    domain::protocol::*,
    service::{job_store::JobStore, job_types::JobOutput},
};
#[test]
fn worker_pins_immutable_decisions_and_versions_before_reported_render_failure() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("media")).unwrap();
    let source = root.path().join("media/source.webm");
    std::fs::write(&source, b"source").unwrap();
    let store = JobStore::open(root.path()).unwrap();
    let document = Document::new(crate::fixtures::project());
    let started = store
        .start(
            document.clone(),
            super::job_snapshot::context(&document),
            super::job_snapshot::kind(),
            JobOutput::Export(root.path().join("incorrect-kind.webm")),
        )
        .unwrap();
    let failed = super::job_store::wait(&store, started.id);
    assert_eq!(failed.phase, JobPhase::Failed);
    assert!(failed.error.unwrap().contains("does not match"));
    assert_eq!(
        failed.source_versions.values().next().unwrap().byte_length,
        6
    );
    assert!(failed.snapshot_id.is_some());
    let index = beam_editor_engine::domain::project::blocks::get::<
        beam_editor_engine::domain::project::block_types::DocumentIndex,
    >(root.path(), &failed.snapshot_id.unwrap())
    .unwrap();
    assert_eq!(index.revision, document.revision);
    assert_eq!(index.active_sequence, document.active_sequence);
    assert_eq!(std::fs::read(source).unwrap(), b"source");
    store.shutdown();
}
