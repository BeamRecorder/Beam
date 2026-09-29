use beam_editor_engine::{
    domain::{protocol::*, timing::Time},
    service::{job_store::JobStore, job_types::JobOutput, preview_render},
};
use std::sync::atomic::AtomicBool;
#[test]
fn cancelled_headless_previews_never_allocate_or_publish_artifacts() {
    let root = tempfile::tempdir().unwrap();
    let project = crate::fixtures::project();
    for quality in [
        RenderQuality::Full,
        RenderQuality::Half,
        RenderQuality::Quarter,
    ] {
        assert!(
            preview_render::render(
                root.path(),
                &project,
                uuid::Uuid::new_v4(),
                Time {
                    ticks: 0,
                    timescale: 1000
                },
                quality,
                &AtomicBool::new(true)
            )
            .unwrap()
            .is_none()
        );
    }
    assert!(!root.path().join(".editor/artifacts").exists());
}
#[test]
#[ignore = "requires OpenGL; renders a headless PNG without any window"]
fn headless_preview_artifact_has_requested_dimensions_and_preserves_transport_revision() {
    let source_dir = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let source = crate::fixtures::media(source_dir.path(), "source.webm", false);
    let controller = beam_editor_engine::EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Preview".into())
        .unwrap();
    controller.import(vec![source]).unwrap();
    controller.seek(100).unwrap();
    let document = controller.document().unwrap();
    let before = controller.transport().unwrap();
    let store = JobStore::open(root.path()).unwrap();
    let info = store
        .start(
            document.clone(),
            super::job_snapshot::context(&document),
            JobKind::Preview {
                time: Time {
                    ticks: 750,
                    timescale: 1000,
                },
                quality: RenderQuality::Half,
            },
            JobOutput::Preview,
        )
        .unwrap();
    let done = super::job_store::wait(&store, info.id);
    assert_eq!(done.phase, JobPhase::Completed, "{:?}", done.error);
    let artifact = store.artifacts().pop().unwrap();
    assert_eq!((artifact.width, artifact.height), (160, 90));
    assert_eq!(artifact.mime_type, "image/png");
    assert_eq!(done.artifacts, [artifact.id]);
    assert_eq!(controller.document().unwrap().revision, document.revision);
    assert_eq!(
        controller.transport().unwrap().position_ms,
        before.position_ms
    );
    let bytes =
        beam_editor_engine::service::artifacts::read(root.path(), &artifact, 0, 262144).unwrap();
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(bytes.data_base64)
        .unwrap();
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    store.shutdown();
    drop(store);
    assert_eq!(
        JobStore::open(root.path())
            .unwrap()
            .get(info.id)
            .unwrap()
            .phase,
        JobPhase::Completed
    );
}
