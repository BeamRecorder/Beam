use beam_editor_engine::{
    EditorController,
    domain::protocol::*,
    service::{EditorService, grants::GrantRegistry},
};
use std::sync::Arc;
#[test]
fn compact_project_and_sequence_queries_have_bounded_pages_and_no_source_paths() {
    let root = tempfile::tempdir().unwrap();
    let grants = Arc::new(GrantRegistry::default());
    let grant = grants.authorize_project(root.path()).unwrap();
    let service = EditorService::new(Arc::new(EditorController::new().unwrap()), grants);
    let Response::Project { project } = service
        .request(Request::Create {
            project_grant: grant,
            name: "Paged".into(),
        })
        .unwrap()
    else {
        panic!("project");
    };
    let Response::Sequences { page } = service
        .request(Request::Query {
            query: Query::Sequences {
                offset: 0,
                limit: 1,
            },
        })
        .unwrap()
    else {
        panic!("sequence page");
    };
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].id, project.active_sequence);
    assert!(page.next.is_none());
    assert!(
        service
            .request(Request::Query {
                query: Query::Definitions {
                    offset: 0,
                    limit: 257
                }
            })
            .is_err()
    );
    assert!(
        service
            .request(Request::Query {
                query: Query::Tracks {
                    sequence_id: uuid::Uuid::nil(),
                    offset: 0,
                    limit: 1
                }
            })
            .is_err()
    );
    let response = service
        .request(Request::Query {
            query: Query::Assets {
                offset: 0,
                limit: 10,
            },
        })
        .unwrap();
    assert!(!serde_json::to_string(&response).unwrap().contains("path"));
}
