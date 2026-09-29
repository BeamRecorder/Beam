use beam_editor_engine::{
    EditorController,
    domain::protocol::*,
    service::{EditorService, grants::GrantRegistry},
};
use std::sync::Arc;
fn context(service: &EditorService) -> RenderContext {
    let document = service.controller.document().unwrap();
    RenderContext {
        project_id: document.project.id,
        sequence_id: document.active_sequence,
        expected_revision: document.revision,
        idempotency_key: uuid::Uuid::new_v4().to_string(),
    }
}

#[test]
fn source_and_destination_grants_reject_wrong_kinds_and_revocation() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("source.webm");
    std::fs::write(&source, b"source").unwrap();
    let grants = Arc::new(GrantRegistry::default());
    assert!(grants.authorize_source(root.path()).is_err());
    assert!(grants.authorize_destination(&source).is_err());
    let source_grant = grants.authorize_source(&source).unwrap();
    grants.revoke(&source_grant);
    let service = EditorService::new(Arc::new(EditorController::new().unwrap()), grants);
    assert!(matches!(
        service.request(Request::Import {
            context: RenderContext {
                project_id: uuid::Uuid::new_v4(),
                sequence_id: uuid::Uuid::new_v4(),
                expected_revision: 0,
                idempotency_key: "revoked-source".into()
            },
            source_grants: vec![source_grant]
        }),
        Err(beam_editor_engine::EditorError::Unauthorized(_))
    ));
}
#[test]
fn export_filenames_cannot_traverse_or_replace_a_preexisting_file() {
    let root = tempfile::tempdir().unwrap();
    let grants = Arc::new(GrantRegistry::default());
    let project = grants.authorize_project(root.path()).unwrap();
    let destination = grants.authorize_destination(root.path()).unwrap();
    let service = EditorService::new(Arc::new(EditorController::new().unwrap()), grants);
    service
        .request(Request::Create {
            project_grant: project,
            name: "Empty".into(),
        })
        .unwrap();
    for name in [
        "../escape.webm",
        "/absolute.webm",
        "a\\b.webm",
        "a:b.webm",
        "",
    ] {
        assert!(matches!(
            service.request(Request::Export {
                context: context(&service),
                destination_grant: destination.clone(),
                file_name: name.into(),
                container: Container::Webm
            }),
            Err(beam_editor_engine::EditorError::Unauthorized(_))
        ));
    }
    std::fs::write(root.path().join("existing.webm"), b"original").unwrap();
    assert!(
        service
            .request(Request::Export {
                context: context(&service),
                destination_grant: destination,
                file_name: "existing.webm".into(),
                container: Container::Webm
            })
            .is_err()
    );
    assert_eq!(
        std::fs::read(root.path().join("existing.webm")).unwrap(),
        b"original"
    );
}
#[cfg(unix)]
#[test]
fn replacing_granted_root_with_a_symlink_revokes_its_resolution() {
    let root = tempfile::tempdir().unwrap();
    let safe = root.path().join("safe");
    let outside = root.path().join("outside");
    std::fs::create_dir(&safe).unwrap();
    std::fs::create_dir(&outside).unwrap();
    let grants = Arc::new(GrantRegistry::default());
    let grant = grants.authorize_destination(&safe).unwrap();
    let project = grants.authorize_project(root.path()).unwrap();
    std::fs::remove_dir(&safe).unwrap();
    std::os::unix::fs::symlink(&outside, &safe).unwrap();
    let service = EditorService::new(Arc::new(EditorController::new().unwrap()), grants);
    service
        .request(Request::Create {
            project_grant: project,
            name: "Empty".into(),
        })
        .unwrap();
    assert!(matches!(
        service.request(Request::Export {
            context: context(&service),
            destination_grant: grant,
            file_name: "result.webm".into(),
            container: Container::Webm
        }),
        Err(beam_editor_engine::EditorError::Unauthorized(_))
    ));
}
