use beam_editor_engine::{domain::protocol::*, service::job_context};
#[test]
fn scopes_project_revisions_and_keys_are_exact_for_both_job_contexts() {
    let project = uuid::Uuid::new_v4();
    let target = uuid::Uuid::new_v4();
    for context in [
        JobContext::Sequence {
            context: RenderContext {
                project_id: project,
                sequence_id: target,
                expected_revision: 11,
                idempotency_key: "request".into(),
            },
        },
        JobContext::Source {
            context: SourceContext {
                project_id: project,
                asset_id: target,
                expected_revision: 11,
                idempotency_key: "request".into(),
            },
        },
    ] {
        assert_eq!(job_context::project(&context), project);
        assert_eq!(job_context::revision(&context), 11);
        assert_eq!(job_context::key(&context), "request");
        assert!(job_context::valid_scope(&job_context::scope(&context)));
    }
    assert!(!job_context::valid_scope(&JobScope::Sequence {
        sequence_id: uuid::Uuid::nil()
    }));
    assert!(!job_context::valid_scope(&JobScope::Source {
        asset_id: uuid::Uuid::nil()
    }));
}
