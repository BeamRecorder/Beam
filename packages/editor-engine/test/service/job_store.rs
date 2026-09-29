use super::job_snapshot::{context, kind};
use beam_editor_engine::{
    Document,
    domain::protocol::*,
    service::{
        job_store::JobStore,
        job_types::{JobOutput, JobRecord},
    },
};
use std::{
    path::Path,
    time::{Duration, Instant},
};
pub fn wait(store: &JobStore, id: uuid::Uuid) -> JobInfo {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let info = store.get(id).unwrap();
        if !matches!(info.phase, JobPhase::Queued | JobPhase::Rendering) {
            return info;
        }
        assert!(Instant::now() < deadline, "job timed out: {info:?}");
        std::thread::sleep(Duration::from_millis(10));
    }
}
fn record_path(root: &Path, record: &JobRecord) -> std::path::PathBuf {
    root.join(format!(".editor/jobs/{}.json", record.info.id))
}
#[test]
fn interrupted_jobs_are_recovered_as_failed_without_claiming_a_completed_artifact() {
    for phase in [JobPhase::Queued, JobPhase::Rendering] {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join(".editor/jobs")).unwrap();
        let record = super::job_types::record(phase);
        std::fs::write(
            record_path(root.path(), &record),
            serde_json::to_vec(&record).unwrap(),
        )
        .unwrap();
        let store = JobStore::open(root.path()).unwrap();
        let info = store.get(record.info.id).unwrap();
        assert_eq!(info.phase, JobPhase::Failed);
        assert!(info.error.unwrap().contains("owner stopped"));
        assert!(store.artifacts().is_empty());
        drop(store);
        assert_eq!(
            JobStore::open(root.path())
                .unwrap()
                .get(record.info.id)
                .unwrap()
                .phase,
            JobPhase::Failed
        );
    }
}
#[test]
fn invalid_job_metadata_and_missing_ids_are_explicit_errors() {
    let root = tempfile::tempdir().unwrap();
    let store = JobStore::open(root.path()).unwrap();
    assert!(store.get(uuid::Uuid::nil()).is_err());
    assert!(store.cancel(uuid::Uuid::nil()).is_err());
    assert!(store.jobs().is_empty());
    let mut record = super::job_types::record(JobPhase::Failed);
    record.info.revision += 1;
    std::fs::write(
        record_path(root.path(), &record),
        serde_json::to_vec(&record).unwrap(),
    )
    .unwrap();
    assert!(JobStore::open(root.path()).is_err());
    std::fs::remove_file(record_path(root.path(), &record)).unwrap();
    std::fs::write(root.path().join(".editor/jobs/unknown.json"), b"{}").unwrap();
    assert!(JobStore::open(root.path()).is_err());
}
#[test]
fn idempotency_survives_failure_restart_and_later_document_edits() {
    let root = tempfile::tempdir().unwrap();
    let store = JobStore::open(root.path()).unwrap();
    let mut document = Document::new(crate::fixtures::project());
    let scope = context(&document);
    let started = store
        .start(document.clone(), scope.clone(), kind(), JobOutput::Preview)
        .unwrap();
    let failed = wait(&store, started.id);
    assert_eq!(failed.phase, JobPhase::Failed);
    assert!(failed.error.unwrap().contains("source"));
    store.shutdown();
    drop(store);
    let store = JobStore::open(root.path()).unwrap();
    document.revision = 100;
    assert_eq!(
        store
            .start(document.clone(), scope.clone(), kind(), JobOutput::Preview)
            .unwrap()
            .id,
        started.id
    );
    let different = JobKind::Preview {
        time: beam_editor_engine::domain::timing::Time {
            ticks: 700,
            timescale: 1000,
        },
        quality: RenderQuality::Full,
    };
    assert!(
        store
            .start(document, scope, different, JobOutput::Preview)
            .is_err()
    );
    assert_eq!(store.jobs().len(), 1);
    assert_eq!(store.cancel(started.id).unwrap().phase, JobPhase::Failed);
}
#[test]
fn request_validation_does_not_publish_jobs_or_partial_outputs() {
    let root = tempfile::tempdir().unwrap();
    let store = JobStore::open(root.path()).unwrap();
    let document = Document::new(crate::fixtures::project());
    for key in ["".to_owned(), "a".repeat(129), "nul\0key".to_owned()] {
        let mut scope = context(&document);
        scope.idempotency_key = key;
        assert!(
            store
                .start(document.clone(), scope, kind(), JobOutput::Preview)
                .is_err()
        );
    }
    let mut stale = context(&document);
    stale.expected_revision += 1;
    assert!(
        store
            .start(document, stale, kind(), JobOutput::Preview)
            .is_err()
    );
    assert!(store.jobs().is_empty());
}
#[cfg(unix)]
#[test]
fn job_record_symlinks_cannot_load_external_metadata() {
    let root = tempfile::tempdir().unwrap();
    let _store = JobStore::open(root.path()).unwrap();
    let outside = root.path().join("record");
    let record = super::job_types::record(JobPhase::Failed);
    std::fs::write(&outside, serde_json::to_vec(&record).unwrap()).unwrap();
    std::os::unix::fs::symlink(outside, record_path(root.path(), &record)).unwrap();
    assert!(JobStore::open(root.path()).is_err());
}
