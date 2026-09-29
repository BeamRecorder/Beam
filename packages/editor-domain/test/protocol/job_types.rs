use beam_editor_domain::protocol::*;
use serde_json::json;
#[test]
fn render_context_requires_identity_revision_and_idempotency_without_paths() {
    let context = RenderContext {
        project_id: uuid::Uuid::new_v4(),
        sequence_id: uuid::Uuid::new_v4(),
        expected_revision: 42,
        idempotency_key: "repeat".into(),
    };
    let value = serde_json::to_value(context).unwrap();
    assert_eq!(value["expectedRevision"], 42);
    assert!(value.get("path").is_none());
    for property in [
        "projectId",
        "sequenceId",
        "expectedRevision",
        "idempotencyKey",
    ] {
        let mut invalid = value.clone();
        invalid.as_object_mut().unwrap().remove(property);
        assert!(serde_json::from_value::<RenderContext>(invalid).is_err());
    }
    let mut invalid = value;
    invalid["path"] = json!("/private/source");
    assert!(serde_json::from_value::<RenderContext>(invalid).is_err());
}
#[test]
fn job_variants_and_quality_are_strictly_typed() {
    for quality in ["full", "half", "quarter"] {
        let kind: JobKind = serde_json::from_value(
            json!({"kind":"preview","time":{"ticks":30000,"timescale":30000},"quality":quality}),
        )
        .unwrap();
        assert_eq!(serde_json::to_value(kind).unwrap()["quality"], quality);
    }
    for value in [
        json!({"kind":"analysis","algorithm":"zoomClicksV1"}),
        json!({"kind":"proxy","settings":{"container":"webm","width":128,"height":96,"frameRate":{"numerator":30000,"denominator":1001}}}),
    ] {
        let kind: JobKind = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(kind).unwrap(), value);
    }
    for invalid in [
        json!({"kind":"preview","time":{"ticks":1,"timescale":1},"quality":"fake"}),
        json!({"kind":"export","container":"avi"}),
        json!({"kind":"export","container":"webm","destinationPath":"/unsafe"}),
    ] {
        assert!(serde_json::from_value::<JobKind>(invalid).is_err());
    }
}
#[test]
fn artifact_resources_use_an_explicit_byte_budget() {
    let data = ArtifactData {
        artifact_id: uuid::Uuid::new_v4(),
        offset: 0,
        byte_length: 2,
        data_base64: "AQI=".into(),
        next: None,
    };
    let value = serde_json::to_value(&data).unwrap();
    assert_eq!(value["dataBase64"], "AQI=");
    assert_eq!(ARTIFACT_CHUNK_BYTES, 262144);
    assert!(serde_json::from_value::<ArtifactData>(value).is_ok());
    assert!(serde_json::from_value::<JobPhase>(json!("idle")).is_err());
}

#[test]
fn async_import_jobs_have_real_sequence_scope_and_explicit_source_count() {
    use beam_editor_domain::protocol::{JobKind, Request};
    let id = uuid::Uuid::new_v4();
    let request = serde_json::json!({"method":"importStart","context":{"projectId":id,"sequenceId":id,"expectedRevision":4,"idempotencyKey":"import-job"},"sourceGrants":["one","two"]});
    assert_eq!(
        serde_json::to_value(serde_json::from_value::<Request>(request.clone()).unwrap()).unwrap(),
        request
    );
    let kind = serde_json::json!({"kind":"import","sourceCount":2});
    assert_eq!(
        serde_json::to_value(serde_json::from_value::<JobKind>(kind.clone()).unwrap()).unwrap(),
        kind
    );
    assert!(
        serde_json::from_value::<JobKind>(serde_json::json!({"kind":"import","source_count":2}))
            .is_err()
    );
    assert!(serde_json::from_value::<Request>(serde_json::json!({"method":"importStart","context":request["context"],"paths":["/private"]})).is_err());
    let schema = beam_editor_domain::protocol::schema().unwrap();
    let import = schema["definitions"]["JobKind"]["oneOf"]
        .as_array()
        .unwrap()
        .iter()
        .find(|variant| variant["properties"]["kind"]["enum"][0] == "import")
        .unwrap();
    assert!(import["properties"].get("sourceCount").is_some());
    assert!(import["properties"].get("source_count").is_none());
}
