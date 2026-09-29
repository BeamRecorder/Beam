use beam_editor_domain::protocol::*;
use serde_json::json;
use uuid::Uuid;

#[test]
fn source_scope_never_contains_a_fabricated_sequence() {
    let id = Uuid::new_v4();
    let context = SourceContext {
        project_id: id,
        asset_id: id,
        expected_revision: 2,
        idempotency_key: "source".into(),
    };
    let value = serde_json::to_value(JobContext::Source { context }).unwrap();
    assert_eq!(value["kind"], "source");
    assert_eq!(value["context"]["assetId"], id.to_string());
    assert!(value["context"].get("sequenceId").is_none());
    let scope = serde_json::to_value(JobScope::Source { asset_id: id }).unwrap();
    assert_eq!(scope, json!({"kind":"source","assetId":id}));
    let seq = serde_json::to_value(JobScope::Sequence { sequence_id: id }).unwrap();
    assert_eq!(seq, json!({"kind":"sequence","sequenceId":id}));
}
#[test]
fn source_context_is_strict_and_algorithm_is_versioned() {
    assert!(serde_json::from_value::<SourceContext>(json!({"projectId":Uuid::new_v4(),"assetId":Uuid::new_v4(),"expectedRevision":0,"idempotencyKey":"k","path":"/private"})).is_err());
    assert_eq!(
        serde_json::to_value(AnalysisAlgorithm::ZoomClicksV1).unwrap(),
        "zoomClicksV1"
    );
    assert!(serde_json::from_value::<AnalysisAlgorithm>(json!("unversioned")).is_err());
}
#[test]
fn source_schemas_are_generated_from_the_rust_authority() {
    let schema = schema().unwrap();
    for name in [
        "SourceContext",
        "JobScope",
        "JobContext",
        "SourceAnalysis",
        "ProxySettings",
    ] {
        assert!(schema["definitions"][name].is_object(), "{name}");
    }
}
