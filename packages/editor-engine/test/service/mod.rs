mod artifacts;
mod grants;
mod import_job;
mod import_job_types;
mod import_start;
mod job_context;
mod job_runner;
mod job_snapshot;
mod job_start;
mod job_store;
mod job_types;
mod job_validation;
mod preview_render;
mod query;
mod source_render;
use beam_editor_engine::{
    EditorController,
    domain::{Edit, commands::single, protocol::*},
    service::{EditorService, grants::GrantRegistry},
};
use std::sync::Arc;

#[test]
fn all_frontends_share_revision_dry_run_and_durable_receipts() {
    let root = tempfile::tempdir().unwrap();
    let controller = Arc::new(EditorController::new().unwrap());
    let grants = Arc::new(GrantRegistry::default());
    let grant = grants.authorize_project(root.path()).unwrap();
    let service = EditorService::new(controller.clone(), grants);
    service
        .request(Request::Create {
            project_grant: grant,
            name: "Original".into(),
        })
        .unwrap();
    let document = controller.document().unwrap();
    let transaction = single(
        &document,
        Edit::Rename {
            name: "Edited".into(),
        },
    );
    let valid = service
        .request(Request::ValidateTransaction {
            transaction: transaction.clone(),
        })
        .unwrap();
    assert!(matches!(valid, Response::Receipt { .. }));
    assert_eq!(controller.document().unwrap(), document);
    let applied = service
        .request(Request::Transaction {
            transaction: transaction.clone(),
        })
        .unwrap();
    let revision = controller.document().unwrap().revision;
    assert_eq!(revision, 1);
    assert!(matches!(applied, Response::Receipt { .. }));
    service
        .request(Request::Transaction { transaction })
        .unwrap();
    assert_eq!(controller.document().unwrap().revision, revision);
    let Response::Events { page } = service
        .request(Request::Events {
            after_revision: 0,
            limit: 10,
        })
        .unwrap()
    else {
        panic!("missing events");
    };
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].sequence_id, document.active_sequence);
    let mut stale = single(
        &document,
        Edit::Rename {
            name: "Stale".into(),
        },
    );
    stale.idempotency_key = "new-attempt".into();
    assert!(matches!(
        service.request(Request::Transaction { transaction: stale }),
        Err(beam_editor_engine::EditorError::Conflict {
            expected: 0,
            actual: 1
        })
    ));
}

#[test]
fn service_without_project_still_discovers_contract_and_returns_missing_project_errors() {
    let service = EditorService::new(
        Arc::new(EditorController::new().unwrap()),
        Arc::new(GrantRegistry::default()),
    );
    assert!(matches!(
        service.request(Request::Schema).unwrap(),
        Response::Schema { .. }
    ));
    assert!(
        service
            .request(Request::Query {
                query: Query::Project
            })
            .is_err()
    );
    assert!(
        service
            .request(Request::Open {
                project_grant: "unissued".into()
            })
            .is_err()
    );
}

#[test]
fn garbage_collection_requires_current_owner_scope_and_preserves_revision() {
    let root = tempfile::tempdir().unwrap();
    let controller = Arc::new(EditorController::new().unwrap());
    let grants = Arc::new(GrantRegistry::default());
    let grant = grants.authorize_project(root.path()).unwrap();
    let service = EditorService::new(controller.clone(), grants);
    service
        .request(Request::Create {
            project_grant: grant,
            name: "Maintenance".into(),
        })
        .unwrap();
    let document = controller.document().unwrap();
    let hash = beam_editor_engine::domain::project::blocks::put(root.path(), &"obsolete").unwrap();
    assert!(
        service
            .request(Request::GarbageCollect {
                project_id: uuid::Uuid::nil(),
                expected_revision: document.revision
            })
            .is_err()
    );
    assert!(matches!(
        service.request(Request::GarbageCollect {
            project_id: document.project.id,
            expected_revision: document.revision + 1
        }),
        Err(beam_editor_engine::EditorError::Conflict { .. })
    ));
    let Response::GarbageCollection { result } = service
        .request(Request::GarbageCollect {
            project_id: document.project.id,
            expected_revision: document.revision,
        })
        .unwrap()
    else {
        panic!("missing collection result");
    };
    assert_eq!(result.removed_blocks, 1);
    assert!(
        !root
            .path()
            .join(format!(".editor/blocks/{hash}.json"))
            .exists()
    );
    assert_eq!(controller.document().unwrap().revision, document.revision);
}
#[test]
fn imports_publish_durable_revision_events_without_fictitious_transaction_receipts() {
    let root = tempfile::tempdir().unwrap();
    let media = tempfile::tempdir().unwrap();
    let controller = Arc::new(EditorController::new().unwrap());
    let grants = Arc::new(GrantRegistry::default());
    let project_grant = grants.authorize_project(root.path()).unwrap();
    let path = crate::fixtures::media(media.path(), "event.webm", false);
    let source_grant = grants.authorize_source(&path).unwrap();
    let service = EditorService::new(controller.clone(), grants);
    service
        .request(Request::Create {
            project_grant,
            name: "Events".into(),
        })
        .unwrap();
    let initial = controller.document().unwrap();
    service
        .request(Request::Import {
            context: RenderContext {
                project_id: initial.project.id,
                sequence_id: initial.active_sequence,
                expected_revision: initial.revision,
                idempotency_key: "import-event".into(),
            },
            source_grants: vec![source_grant],
        })
        .unwrap();
    let document = controller.document().unwrap();
    assert_eq!(document.revision, 1);
    assert!(document.receipts.is_empty());
    let Response::Events { page } = service
        .request(Request::Events {
            after_revision: 0,
            limit: 1,
        })
        .unwrap()
    else {
        panic!("missing import event")
    };
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].revision, 1);
    assert!(page.items[0].command_ids.is_empty());
    assert_eq!(page.items[0].sequence_id, document.active_sequence);
    assert!(
        service
            .request(Request::Events {
                after_revision: 2,
                limit: 1
            })
            .is_err()
    );
    let saved = beam_editor_engine::domain::project::store::read_document(
        &root.path().join("editor.beam.json"),
    )
    .unwrap();
    assert_eq!(saved.event_journal, document.event_journal);
}
