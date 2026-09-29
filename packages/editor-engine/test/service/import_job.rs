use super::{
    import_job_types::{persist_record, read_record},
    import_start::{context, media_files, owner, resource, start, wait},
};
use beam_editor_engine::{
    domain::protocol::*,
    service::{artifacts, job_store::JobStore},
};
use uuid::Uuid;

#[test]
fn an_invalid_second_source_discards_the_entire_import_candidate_and_first_managed_copy() {
    let root = tempfile::tempdir().unwrap();
    let selected = tempfile::tempdir().unwrap();
    let valid = crate::fixtures::media(selected.path(), "valid.webm", false);
    let invalid = selected.path().join("invalid.webm");
    std::fs::write(&invalid, b"this is not finite media").unwrap();
    let versions = [
        artifacts::version(&valid).unwrap(),
        artifacts::version(&invalid).unwrap(),
    ];
    let owner = owner(root.path(), true);
    let initial = owner.controller.document().unwrap();
    let started = start(
        &owner,
        context(&owner, "invalid-compound"),
        &[valid.clone(), invalid.clone()],
    );
    let done = wait(&owner.service, started.id);
    assert_eq!(done.phase, JobPhase::Failed);
    assert!(done.error.is_some());
    assert!(done.artifacts.is_empty());
    assert!(done.source_versions.is_empty());
    assert_eq!(owner.controller.document().unwrap(), initial);
    assert!(media_files(root.path()).is_empty());
    assert_eq!(artifacts::version(&valid).unwrap(), versions[0]);
    assert_eq!(artifacts::version(&invalid).unwrap(), versions[1]);
    let Response::Artifacts { page } = owner
        .service
        .request(Request::Query {
            query: Query::Artifacts {
                offset: 0,
                limit: 10,
            },
        })
        .unwrap()
    else {
        panic!("missing artifacts")
    };
    assert!(page.items.is_empty());
    assert!(
        read_record(root.path(), started.id)
            .import_publication
            .is_none()
    );
    let saved = beam_editor_engine::domain::project::store::read_document(
        &root.path().join("editor.beam.json"),
    )
    .unwrap();
    assert_eq!(saved, initial);
}

#[test]
fn open_recovers_only_an_exact_durable_import_publication_and_recreates_its_json_resource() {
    let root = tempfile::tempdir().unwrap();
    let selected = tempfile::tempdir().unwrap();
    let paths = vec![crate::fixtures::media(
        selected.path(),
        "source.webm",
        false,
    )];
    let first_owner = owner(root.path(), true);
    let started = start(
        &first_owner,
        context(&first_owner, "recover-import"),
        &paths,
    );
    let completed = wait(&first_owner.service, started.id);
    assert_eq!(
        completed.phase,
        JobPhase::Completed,
        "{:?}",
        completed.error
    );
    let accepted = first_owner.controller.document().unwrap();
    let (old_artifact, publication) = resource(&first_owner, started.id);
    let files = media_files(root.path());
    let mut record = read_record(root.path(), started.id);
    drop(first_owner);
    record.info.phase = JobPhase::Rendering;
    record.info.progress = 0.95;
    record.info.artifacts.clear();
    record.artifacts.clear();
    persist_record(root.path(), &record);
    std::fs::remove_file(
        root.path()
            .join(format!(".editor/artifacts/{}.bin", old_artifact.id)),
    )
    .unwrap();
    let interrupted = JobStore::open(root.path()).unwrap();
    let failed = interrupted.get(started.id).unwrap();
    assert_eq!(failed.phase, JobPhase::Failed);
    assert!(failed.error.unwrap().contains("owner stopped"));
    assert!(interrupted.artifacts().is_empty());
    drop(interrupted);
    let owner = owner(root.path(), false);
    let recovered = wait(&owner.service, started.id);
    assert_eq!(recovered.phase, JobPhase::Completed);
    assert_eq!(recovered.progress, 1.);
    assert!(recovered.error.is_none());
    assert_eq!(recovered.source_versions, completed.source_versions);
    assert_eq!(recovered.snapshot_id, completed.snapshot_id);
    assert_eq!(owner.controller.document().unwrap(), accepted);
    assert_eq!(media_files(root.path()), files);
    let (new_artifact, recovered_publication) = resource(&owner, started.id);
    assert_ne!(new_artifact.id, old_artifact.id);
    assert_eq!(recovered.artifacts, [new_artifact.id]);
    assert_eq!(recovered_publication, publication);
    assert_eq!(recovered_publication, accepted.import_publications[0]);
    assert_eq!(
        read_record(root.path(), started.id).import_publication,
        Some(publication)
    );
}

#[test]
fn open_never_promotes_a_different_candidate_or_a_cancelled_import_despite_a_matching_key() {
    for cancelled in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let selected = tempfile::tempdir().unwrap();
        let paths = vec![crate::fixtures::media(
            selected.path(),
            "source.webm",
            false,
        )];
        let first_owner = owner(root.path(), true);
        let started = start(
            &first_owner,
            context(&first_owner, "unrecoverable-import"),
            &paths,
        );
        let completed = wait(&first_owner.service, started.id);
        assert_eq!(
            completed.phase,
            JobPhase::Completed,
            "{:?}",
            completed.error
        );
        let accepted = first_owner.controller.document().unwrap();
        let artifact = resource(&first_owner, started.id).0;
        let mut record = read_record(root.path(), started.id);
        drop(first_owner);
        record.info.phase = if cancelled {
            JobPhase::Cancelled
        } else {
            JobPhase::Rendering
        };
        record.info.progress = 0.95;
        record.info.artifacts.clear();
        record.artifacts.clear();
        if !cancelled {
            record.import_publication.as_mut().unwrap().clip_ids[0] = Uuid::new_v4();
        }
        persist_record(root.path(), &record);
        std::fs::remove_file(
            root.path()
                .join(format!(".editor/artifacts/{}.bin", artifact.id)),
        )
        .unwrap();
        let owner = owner(root.path(), false);
        let job = wait(&owner.service, started.id);
        assert_eq!(
            job.phase,
            if cancelled {
                JobPhase::Cancelled
            } else {
                JobPhase::Failed
            }
        );
        assert!(job.artifacts.is_empty());
        assert_eq!(owner.controller.document().unwrap(), accepted);
        let Response::Artifacts { page } = owner
            .service
            .request(Request::Query {
                query: Query::Artifacts {
                    offset: 0,
                    limit: 10,
                },
            })
            .unwrap()
        else {
            panic!("missing artifacts")
        };
        assert!(page.items.is_empty());
        assert_eq!(
            std::fs::read_dir(root.path().join(".editor/artifacts"))
                .unwrap()
                .count(),
            0
        );
    }
}

#[test]
fn cancelling_a_completed_import_preserves_its_accepted_sources_and_publication() {
    let root = tempfile::tempdir().unwrap();
    let selected = tempfile::tempdir().unwrap();
    let paths = vec![crate::fixtures::media(
        selected.path(),
        "source.webm",
        false,
    )];
    let owner = owner(root.path(), true);
    let started = start(&owner, context(&owner, "completed-cancel"), &paths);
    let completed = wait(&owner.service, started.id);
    assert_eq!(
        completed.phase,
        JobPhase::Completed,
        "{:?}",
        completed.error
    );
    let accepted = owner.controller.document().unwrap();
    let files = media_files(root.path());
    let publication = resource(&owner, started.id).1;
    let Response::Job { job } = owner
        .service
        .request(Request::JobCancel { id: started.id })
        .unwrap()
    else {
        panic!("missing job")
    };
    assert_eq!(job.phase, JobPhase::Completed);
    assert_eq!(owner.controller.document().unwrap(), accepted);
    assert_eq!(media_files(root.path()), files);
    assert_eq!(resource(&owner, started.id).1, publication);
}
