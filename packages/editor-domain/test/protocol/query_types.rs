use beam_editor_domain::protocol::Query;
use serde_json::json;

#[test]
fn query_contract_preserves_explicit_scope_and_denies_unknown_paths() {
    let id = uuid::Uuid::new_v4();
    for value in [
        json!({"kind":"asset","id":id}),
        json!({"kind":"clip","sequenceId":id,"clipId":id}),
        json!({"kind":"presets","offset":0,"limit":256}),
        json!({"kind":"track","sequenceId":id,"trackId":id}),
        json!({"kind":"sequence","sequenceId":id}),
        json!({"kind":"clipHeaders","sequenceId":id,"offset":0,"limit":256}),
        json!({"kind":"scopedParameterValues","target":{"kind":"track","sequenceId":id,"trackId":id},"time":{"ticks":0,"timescale":1000}}),
    ] {
        let query: Query = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(query).unwrap(), value);
    }
    for value in [
        json!({"kind":"asset","id":id,"path":"/private"}),
        json!({"kind":"clip","clipId":id}),
        json!({"kind":"tracks","sequenceId":id,"offset":0}),
    ] {
        assert!(serde_json::from_value::<Query>(value).is_err());
    }
}
