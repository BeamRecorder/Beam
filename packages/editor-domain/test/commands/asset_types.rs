use beam_editor_domain::protocol::{RenderContext, Request};

#[test]
fn relink_contract_contains_opaque_source_grants_and_explicit_targets() {
    let id = uuid::Uuid::new_v4();
    let value = serde_json::to_value(Request::Relink {
        context: RenderContext {
            project_id: id,
            sequence_id: id,
            expected_revision: 7,
            idempotency_key: "relink".into(),
        },
        asset_id: id,
        source_grant: "authorized-source".into(),
        clip_ids: vec![id],
    })
    .unwrap();
    assert_eq!(value["assetId"], id.to_string());
    assert_eq!(value["clipIds"], serde_json::json!([id]));
    assert_eq!(value["sourceGrant"], "authorized-source");
    let mut invalid = value;
    invalid["path"] = serde_json::json!("/untrusted/file");
    assert!(serde_json::from_value::<Request>(invalid).is_err());
}
