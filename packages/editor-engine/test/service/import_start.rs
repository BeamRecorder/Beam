use super::import_job_types::{ImportOwner, read_record};
use base64::Engine;
use beam_editor_engine::{
    EditorController,
    domain::{commands::import_types::ImportPublication, protocol::*},
    service::{EditorService, artifacts, grants::GrantRegistry},
};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};
use uuid::Uuid;

pub(super) fn owner(root: &Path, create: bool) -> ImportOwner {
    let controller = Arc::new(EditorController::new().unwrap());
    let grants = Arc::new(GrantRegistry::default());
    let project_grant = grants.authorize_project(root).unwrap();
    let service = EditorService::new(controller.clone(), grants.clone());
    service
        .request(if create {
            Request::Create {
                project_grant,
                name: "Import jobs".into(),
            }
        } else {
            Request::Open { project_grant }
        })
        .unwrap();
    ImportOwner {
        controller,
        grants,
        service,
    }
}

pub(super) fn context(owner: &ImportOwner, key: &str) -> RenderContext {
    let document = owner.controller.document().unwrap();
    RenderContext {
        project_id: document.project.id,
        sequence_id: document.active_sequence,
        expected_revision: document.revision,
        idempotency_key: key.into(),
    }
}

pub(super) fn start(owner: &ImportOwner, context: RenderContext, paths: &[PathBuf]) -> JobInfo {
    let source_grants = paths
        .iter()
        .map(|path| owner.grants.authorize_source(path).unwrap())
        .collect();
    let Response::Job { job } = owner
        .service
        .request(Request::ImportStart {
            context,
            source_grants,
        })
        .unwrap()
    else {
        panic!("import start must return a job")
    };
    job
}

pub(super) fn wait(service: &EditorService, id: Uuid) -> JobInfo {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let Response::Job { job } = service.request(Request::JobGet { id }).unwrap() else {
            panic!("missing import job")
        };
        if !matches!(job.phase, JobPhase::Queued | JobPhase::Rendering) {
            return job;
        }
        assert!(Instant::now() < deadline, "import job timed out: {job:?}");
        std::thread::sleep(Duration::from_millis(10));
    }
}

pub(super) fn resource(owner: &ImportOwner, job_id: Uuid) -> (ArtifactInfo, ImportPublication) {
    let Response::Artifacts { page } = owner
        .service
        .request(Request::Query {
            query: Query::Artifacts {
                offset: 0,
                limit: 32,
            },
        })
        .unwrap()
    else {
        panic!("missing artifact page")
    };
    let mut artifacts: Vec<_> = page
        .items
        .into_iter()
        .filter(|item| item.job_id == job_id)
        .collect();
    assert_eq!(artifacts.len(), 1);
    let artifact = artifacts.remove(0);
    let Response::ArtifactData { data } = owner
        .service
        .request(Request::ArtifactRead {
            id: artifact.id,
            offset: 0,
            length: ARTIFACT_CHUNK_BYTES,
        })
        .unwrap()
    else {
        panic!("missing import resource")
    };
    assert_eq!(data.next, None);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.data_base64)
        .unwrap();
    assert_eq!(bytes.len() as u64, artifact.byte_length);
    (artifact, serde_json::from_slice(&bytes).unwrap())
}

pub(super) fn media_files(root: &Path) -> Vec<(PathBuf, SourceVersion)> {
    let folder = root.join("media");
    if !folder.exists() {
        return vec![];
    }
    let mut files: Vec<(PathBuf, SourceVersion)> = std::fs::read_dir(folder)
        .unwrap()
        .map(|entry| {
            let path = entry.unwrap().path();
            (
                path.file_name().unwrap().into(),
                artifacts::version(&path).unwrap(),
            )
        })
        .collect();
    files.sort_by(|left, right| left.0.cmp(&right.0));
    files
}

#[test]
fn real_two_source_import_publishes_one_undoable_revision_event_and_exact_json_result() {
    let root = tempfile::tempdir().unwrap();
    let selected = tempfile::tempdir().unwrap();
    let paths = vec![
        crate::fixtures::media(selected.path(), "first.webm", true),
        crate::fixtures::media(selected.path(), "second.webm", false),
    ];
    let versions: Vec<_> = paths
        .iter()
        .map(|path| artifacts::version(path).unwrap())
        .collect();
    let owner = owner(root.path(), true);
    let initial = owner.controller.document().unwrap();
    let scope = context(&owner, "two-source-import");
    let started = start(&owner, scope.clone(), &paths);
    assert_eq!(started.phase, JobPhase::Queued);
    assert!(matches!(started.kind, JobKind::Import { source_count: 2 }));
    let done = wait(&owner.service, started.id);
    assert_eq!(done.phase, JobPhase::Completed, "{:?}", done.error);
    assert_eq!(done.revision, initial.revision);
    assert_eq!(done.progress, 1.);
    assert!(done.snapshot_id.is_some());
    let document = owner.controller.document().unwrap();
    assert_eq!(document.revision, initial.revision + 1);
    assert_eq!(document.undo.len(), 1);
    assert!(document.undo[0].clips.is_empty());
    assert_eq!(document.project.clips.len(), 2);
    assert_eq!(document.project.assets.len(), 2);
    assert!(document.receipts.is_empty());
    assert_eq!(document.import_publications.len(), 1);
    let (artifact, publication) = resource(&owner, started.id);
    assert_eq!(publication, document.import_publications[0]);
    assert_eq!(publication.revision, document.revision);
    assert_eq!(publication.idempotency_key, scope.idempotency_key);
    assert_eq!(artifact.mime_type, "application/json");
    assert_eq!((artifact.width, artifact.height), (0, 0));
    assert_eq!(done.artifacts, [artifact.id]);
    for ((asset, path), version) in document.project.assets.iter().zip(&paths).zip(&versions) {
        assert_eq!(artifacts::version(path).unwrap(), *version);
        assert_eq!(
            artifacts::version(&root.path().join(&asset.path)).unwrap(),
            *version
        );
        assert_eq!(done.source_versions[&asset.id], *version);
        let identity = asset.identity.as_ref().unwrap();
        assert_eq!(
            (&identity.sha256, identity.byte_length),
            (&version.sha256, version.byte_length)
        );
    }
    let Response::Events { page } = owner
        .service
        .request(Request::Events {
            after_revision: 0,
            limit: 10,
        })
        .unwrap()
    else {
        panic!("missing import event")
    };
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].revision, document.revision);
    assert_eq!(page.items[0].sequence_id, initial.active_sequence);
    assert!(page.items[0].command_ids.is_empty());
    let saved = beam_editor_engine::domain::project::store::read_document(
        &root.path().join("editor.beam.json"),
    )
    .unwrap();
    assert_eq!(saved, document);
    let record = read_record(root.path(), started.id);
    assert_eq!(record.import_publication, Some(publication));
}

#[test]
fn completed_import_replays_stale_context_after_restart_without_copying_or_changing_its_shape() {
    let root = tempfile::tempdir().unwrap();
    let selected = tempfile::tempdir().unwrap();
    let paths = vec![
        crate::fixtures::media(selected.path(), "first.webm", false),
        crate::fixtures::media(selected.path(), "second.webm", false),
    ];
    let first_owner = owner(root.path(), true);
    let scope = context(&first_owner, "restart-import");
    let started = start(&first_owner, scope.clone(), &paths);
    let completed = wait(&first_owner.service, started.id);
    assert_eq!(
        completed.phase,
        JobPhase::Completed,
        "{:?}",
        completed.error
    );
    let accepted = first_owner.controller.document().unwrap();
    let files = media_files(root.path());
    drop(first_owner);
    let owner = owner(root.path(), false);
    assert!(scope.expected_revision < accepted.revision);
    let replay = start(&owner, scope.clone(), &paths);
    assert_eq!(
        serde_json::to_value(&replay).unwrap(),
        serde_json::to_value(&completed).unwrap()
    );
    assert_eq!(owner.controller.document().unwrap(), accepted);
    assert_eq!(media_files(root.path()), files);
    let source_grants = paths
        .iter()
        .rev()
        .map(|path| owner.grants.authorize_source(path).unwrap())
        .collect();
    assert!(
        owner
            .service
            .request(Request::ImportStart {
                context: scope,
                source_grants
            })
            .is_err()
    );
    assert_eq!(owner.controller.document().unwrap(), accepted);
    assert_eq!(media_files(root.path()), files);
    let Response::Jobs { page } = owner
        .service
        .request(Request::Query {
            query: Query::Jobs {
                offset: 0,
                limit: 10,
            },
        })
        .unwrap()
    else {
        panic!("missing jobs")
    };
    assert_eq!(page.items.len(), 1);
    assert_eq!(
        resource(&owner, started.id).1,
        accepted.import_publications[0]
    );
}

#[test]
fn invalid_import_grants_contexts_and_source_counts_publish_neither_jobs_nor_copies() {
    let root = tempfile::tempdir().unwrap();
    let selected = tempfile::tempdir().unwrap();
    let path = crate::fixtures::media(selected.path(), "source.webm", false);
    let owner = owner(root.path(), true);
    let initial = owner.controller.document().unwrap();
    let scope = context(&owner, "invalid-import");
    let valid = owner.grants.authorize_source(&path).unwrap();
    let revoked = owner.grants.authorize_source(&path).unwrap();
    owner.grants.revoke(&revoked);
    let wrong_kind = owner.grants.authorize_destination(selected.path()).unwrap();
    for source_grants in [
        vec!["missing".into()],
        vec![revoked],
        vec![wrong_kind],
        vec![],
        vec![valid.clone(); 33],
    ] {
        assert!(
            owner
                .service
                .request(Request::ImportStart {
                    context: scope.clone(),
                    source_grants
                })
                .is_err()
        );
    }
    for invalid in [
        RenderContext {
            project_id: Uuid::nil(),
            ..scope.clone()
        },
        RenderContext {
            sequence_id: Uuid::nil(),
            ..scope.clone()
        },
        RenderContext {
            sequence_id: Uuid::new_v4(),
            ..scope.clone()
        },
        RenderContext {
            expected_revision: scope.expected_revision + 1,
            ..scope.clone()
        },
        RenderContext {
            idempotency_key: "".into(),
            ..scope.clone()
        },
        RenderContext {
            idempotency_key: "x".repeat(129),
            ..scope.clone()
        },
        RenderContext {
            idempotency_key: "nul\0key".into(),
            ..scope.clone()
        },
    ] {
        assert!(
            owner
                .service
                .request(Request::ImportStart {
                    context: invalid,
                    source_grants: vec![valid.clone()]
                })
                .is_err()
        );
    }
    assert_eq!(owner.controller.document().unwrap(), initial);
    assert!(media_files(root.path()).is_empty());
    let Response::Jobs { page } = owner
        .service
        .request(Request::Query {
            query: Query::Jobs {
                offset: 0,
                limit: 10,
            },
        })
        .unwrap()
    else {
        panic!("missing jobs")
    };
    assert!(page.items.is_empty());
}

#[test]
fn replacing_a_source_with_identical_bytes_changes_the_frozen_import_request() {
    let root = tempfile::tempdir().unwrap();
    let selected = tempfile::tempdir().unwrap();
    let path = crate::fixtures::media(selected.path(), "source.webm", false);
    let owner = owner(root.path(), true);
    let scope = context(&owner, "replacement-import");
    let started = start(&owner, scope.clone(), std::slice::from_ref(&path));
    let done = wait(&owner.service, started.id);
    assert_eq!(done.phase, JobPhase::Completed, "{:?}", done.error);
    let accepted = owner.controller.document().unwrap();
    let files = media_files(root.path());
    let replacement = selected.path().join("replacement.webm");
    std::fs::write(&replacement, std::fs::read(&path).unwrap()).unwrap();
    std::fs::remove_file(&path).unwrap();
    std::fs::rename(&replacement, &path).unwrap();
    let grant = owner.grants.authorize_source(&path).unwrap();
    assert!(
        owner
            .service
            .request(Request::ImportStart {
                context: scope,
                source_grants: vec![grant]
            })
            .is_err()
    );
    assert_eq!(owner.controller.document().unwrap(), accepted);
    assert_eq!(media_files(root.path()), files);
}
