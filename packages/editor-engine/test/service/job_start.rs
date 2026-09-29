//! Acceptance behavior is exercised with durable records and real source work.
use super::{
    job_store::wait,
    source_render::{recorded, scope},
};
use beam_editor_engine::{domain::protocol::*, service::job_store::JobStore};

#[test]
fn source_jobs_replay_failed_work_after_restart_and_do_not_resolve_a_sequence() {
    let root = tempfile::tempdir().unwrap();
    let store = JobStore::open(root.path()).unwrap();
    let mut document = recorded();
    let context = scope(&document);
    let kind = JobKind::Analysis {
        algorithm: AnalysisAlgorithm::ZoomClicksV1,
    };
    let info = store
        .start_source(document.clone(), context.clone(), kind.clone())
        .unwrap();
    assert_eq!(
        info.scope,
        JobScope::Source {
            asset_id: context.asset_id
        }
    );
    let done = wait(&store, info.id);
    assert_eq!(done.phase, JobPhase::Failed);
    assert!(done.error.unwrap().contains("source"));
    store.shutdown();
    drop(store);
    document.revision += 1;
    let store = JobStore::open(root.path()).unwrap();
    assert_eq!(
        store.start_source(document, context, kind).unwrap().id,
        info.id
    );
    assert_eq!(store.jobs().len(), 1);
}
#[test]
fn invalid_or_reused_source_scope_does_not_publish_extra_jobs() {
    let root = tempfile::tempdir().unwrap();
    let store = JobStore::open(root.path()).unwrap();
    let document = recorded();
    let context = scope(&document);
    for invalid in [
        SourceContext {
            asset_id: uuid::Uuid::nil(),
            ..context.clone()
        },
        SourceContext {
            expected_revision: 1,
            ..context.clone()
        },
        SourceContext {
            idempotency_key: "".into(),
            ..context.clone()
        },
    ] {
        assert!(
            store
                .start_source(
                    document.clone(),
                    invalid,
                    JobKind::Analysis {
                        algorithm: AnalysisAlgorithm::ZoomClicksV1
                    }
                )
                .is_err()
        );
    }
    assert!(
        store
            .start_source(
                document.clone(),
                context.clone(),
                JobKind::Preview {
                    time: beam_editor_engine::domain::timing::Time::ZERO,
                    quality: RenderQuality::Full
                }
            )
            .is_err()
    );
    assert!(store.jobs().is_empty());
    let info = store
        .start_source(
            document.clone(),
            context.clone(),
            JobKind::Analysis {
                algorithm: AnalysisAlgorithm::ZoomClicksV1,
            },
        )
        .unwrap();
    wait(&store, info.id);
    assert!(
        store
            .start_source(
                document,
                context,
                JobKind::Proxy {
                    settings: super::source_render::settings()
                }
            )
            .is_err()
    );
    assert_eq!(store.jobs().len(), 1);
}
#[test]
fn accepted_analysis_verifies_real_source_bytes_and_persists_opaque_json_resources() {
    let root = tempfile::tempdir().unwrap();
    let mut document = recorded();
    std::fs::create_dir(root.path().join("media")).unwrap();
    let path = root.path().join(&document.project.assets[0].path);
    std::fs::write(&path, b"immutable source for click analysis").unwrap();
    document.project.assets[0].identity =
        Some(beam_editor_engine::project::sources::identity(&path).unwrap());
    let context = scope(&document);
    let store = JobStore::open(root.path()).unwrap();
    let before = document.clone();
    let info = store
        .start_source(
            document.clone(),
            context.clone(),
            JobKind::Analysis {
                algorithm: AnalysisAlgorithm::ZoomClicksV1,
            },
        )
        .unwrap();
    let done = wait(&store, info.id);
    assert_eq!(done.phase, JobPhase::Completed, "{:?}", done.error);
    assert_eq!(done.source_versions.len(), 1);
    assert!(done.snapshot_id.is_some());
    assert_eq!(document, before);
    let artifact = store.artifacts().pop().unwrap();
    assert_eq!(artifact.mime_type, "application/json");
    assert_eq!(done.artifacts, [artifact.id]);
    store.shutdown();
    drop(store);
    let store = JobStore::open(root.path()).unwrap();
    assert_eq!(store.get(info.id).unwrap().phase, JobPhase::Completed);
    assert!(
        beam_editor_engine::service::artifacts::read(
            root.path(),
            &artifact,
            0,
            ARTIFACT_CHUNK_BYTES
        )
        .unwrap()
        .byte_length
            > 0
    );
}
