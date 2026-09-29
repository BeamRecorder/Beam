//! Source relink behavior is exercised through the real owner actor below.
use beam_editor_engine::{
    EditorController,
    domain::{Edit, protocol::*},
    service::{EditorService, grants::GrantRegistry},
};
use std::{fs, sync::Arc};

fn receipt(response: Response) -> beam_editor_engine::domain::commands::types::Receipt {
    let Response::Receipt { receipt } = response else {
        panic!("missing relink receipt")
    };
    receipt
}

#[test]
fn relink_is_undoable_and_durable_retries_with_new_grants_create_no_duplicate_copy() {
    let root = tempfile::tempdir().unwrap();
    let media = tempfile::tempdir().unwrap();
    let source = crate::fixtures::media(media.path(), "source.webm", false);
    let original = fs::read(&source).unwrap();
    let controller = Arc::new(EditorController::new().unwrap());
    controller
        .create(root.path().into(), "Versions".into())
        .unwrap();
    let imported = controller.import(vec![source.clone()]).unwrap();
    let previous = controller.document().unwrap().project.assets[0].clone();
    let context = RenderContext {
        project_id: imported.project.id,
        sequence_id: imported.active_sequence,
        expected_revision: imported.revision,
        idempotency_key: "source-version".into(),
    };
    let clip = imported.project.clips[0].id;
    let grants = Arc::new(GrantRegistry::default());
    let source_grant = grants.authorize_source(&source).unwrap();
    let service = EditorService::new(controller.clone(), grants.clone());
    let request = Request::Relink {
        context: context.clone(),
        asset_id: previous.id,
        source_grant: source_grant.clone(),
        clip_ids: vec![clip],
    };
    let first = receipt(service.request(request.clone()).unwrap());
    let created = first.results[0].created[0];
    assert_ne!(created, previous.id);
    let accepted = controller.document().unwrap();
    assert_eq!(accepted.project.assets.len(), 2);
    assert_eq!(accepted.project.assets[0], previous);
    assert_eq!(
        accepted
            .project
            .clips
            .try_by_id(clip)
            .unwrap()
            .unwrap()
            .asset_id,
        created
    );
    assert_eq!(accepted.revision, context.expected_revision + 1);
    assert_eq!(receipt(service.request(request).unwrap()), first);
    assert_eq!(fs::read_dir(root.path().join("media")).unwrap().count(), 2);
    let Response::Asset { revision, asset } = service
        .request(Request::Query {
            query: Query::Asset { id: created },
        })
        .unwrap()
    else {
        panic!("missing source metadata")
    };
    assert_eq!(revision, accepted.revision);
    assert_eq!(asset.identity, previous.identity);
    controller.edit(accepted.revision, Edit::Undo {}).unwrap();
    assert_eq!(
        controller
            .document()
            .unwrap()
            .project
            .clips
            .try_by_id(clip)
            .unwrap()
            .unwrap()
            .asset_id,
        previous.id
    );
    controller
        .edit(accepted.revision + 1, Edit::Redo {})
        .unwrap();
    assert_eq!(
        controller
            .document()
            .unwrap()
            .project
            .clips
            .try_by_id(clip)
            .unwrap()
            .unwrap()
            .asset_id,
        created
    );
    drop(service);
    drop(controller);
    let reopened = Arc::new(EditorController::new().unwrap());
    reopened.open(root.path().into()).unwrap();
    let grants = Arc::new(GrantRegistry::default());
    let source_grant = grants.authorize_source(&source).unwrap();
    let service = EditorService::new(reopened.clone(), grants);
    assert_eq!(
        receipt(
            service
                .request(Request::Relink {
                    context,
                    asset_id: previous.id,
                    source_grant,
                    clip_ids: vec![clip]
                })
                .unwrap()
        ),
        first
    );
    assert_eq!(reopened.document().unwrap().project.assets.len(), 2);
    assert_eq!(fs::read_dir(root.path().join("media")).unwrap().count(), 2);
    assert_eq!(fs::read(&source).unwrap(), original);
    assert_eq!(fs::read(root.path().join(previous.path)).unwrap(), original);
}

#[test]
fn relink_restores_an_unavailable_managed_source_without_changing_its_prior_version() {
    let root = tempfile::tempdir().unwrap();
    let media = tempfile::tempdir().unwrap();
    let source = crate::fixtures::media(media.path(), "restore.webm", false);
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Restore".into())
        .unwrap();
    let imported = controller.import(vec![source.clone()]).unwrap();
    let previous = controller.document().unwrap().project.assets[0].clone();
    fs::remove_file(root.path().join(&previous.path)).unwrap();
    assert!(controller.retry().is_err());
    let context = RenderContext {
        project_id: imported.project.id,
        sequence_id: imported.active_sequence,
        expected_revision: imported.revision,
        idempotency_key: "restore-source".into(),
    };
    let receipt = controller
        .relink(
            context,
            previous.id,
            vec![imported.project.clips[0].id],
            source.clone(),
        )
        .unwrap();
    let accepted = controller.document().unwrap();
    assert_eq!(accepted.project.assets[0], previous);
    assert_eq!(accepted.project.assets.len(), 2);
    assert!(controller.snapshot().unwrap().transport.error.is_none());
    assert!(!root.path().join(&previous.path).exists());
    let new = accepted
        .project
        .assets
        .iter()
        .find(|asset| asset.id == receipt.results[0].created[0])
        .unwrap();
    assert_eq!(
        fs::read(root.path().join(&new.path)).unwrap(),
        fs::read(source).unwrap()
    );
    assert!(controller.edit(accepted.revision, Edit::Undo {}).is_err());
    assert_eq!(controller.document().unwrap(), accepted);
}

#[test]
fn rejected_relinks_preserve_managed_files_revision_and_the_accepted_frame() {
    let root = tempfile::tempdir().unwrap();
    let media = tempfile::tempdir().unwrap();
    let source = crate::fixtures::media(media.path(), "unchanged.webm", false);
    let controller = Arc::new(EditorController::new().unwrap());
    controller
        .create(root.path().into(), "Reject".into())
        .unwrap();
    let imported = controller.import(vec![source.clone()]).unwrap();
    let before = controller.document().unwrap();
    let previous = before.project.assets[0].id;
    let clip = imported.project.clips[0].id;
    let context = RenderContext {
        project_id: imported.project.id,
        sequence_id: imported.active_sequence,
        expected_revision: imported.revision,
        idempotency_key: "rejected-source".into(),
    };
    let grants = Arc::new(GrantRegistry::default());
    let grant = grants.authorize_source(&source).unwrap();
    let service = EditorService::new(controller.clone(), grants.clone());
    assert!(
        service
            .request(Request::Relink {
                context: context.clone(),
                asset_id: previous,
                source_grant: "unissued".into(),
                clip_ids: vec![clip]
            })
            .is_err()
    );
    let mut stale = context.clone();
    stale.expected_revision += 1;
    assert!(
        service
            .request(Request::Relink {
                context: stale,
                asset_id: previous,
                source_grant: grant.clone(),
                clip_ids: vec![clip]
            })
            .is_err()
    );
    assert!(
        service
            .request(Request::Relink {
                context: context.clone(),
                asset_id: previous,
                source_grant: grant,
                clip_ids: vec![uuid::Uuid::new_v4()]
            })
            .is_err()
    );
    let bad = media.path().join("invalid.webm");
    fs::write(&bad, b"not a supported video").unwrap();
    let bad_grant = grants.authorize_source(&bad).unwrap();
    assert!(
        service
            .request(Request::Relink {
                context,
                asset_id: previous,
                source_grant: bad_grant,
                clip_ids: vec![clip]
            })
            .is_err()
    );
    assert_eq!(controller.document().unwrap(), before);
    assert_eq!(fs::read_dir(root.path().join("media")).unwrap().count(), 1);
    assert!(controller.frame().is_some());
    assert!(controller.snapshot().unwrap().transport.error.is_none());
    assert!(
        service
            .request(Request::Query {
                query: Query::Asset {
                    id: uuid::Uuid::new_v4()
                }
            })
            .is_err()
    );
}
