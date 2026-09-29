use beam_editor_engine::video::visuals::types::VisualRequest;
#[test]
fn source_request_wire_format_is_strict_and_roundtrips() {
    for request in [
        VisualRequest::Video { position_ms: 5 },
        VisualRequest::Audio {
            start_ms: 1,
            end_ms: 10,
            step_ms: 2,
        },
    ] {
        assert_eq!(
            serde_json::from_value::<VisualRequest>(serde_json::to_value(&request).unwrap())
                .unwrap(),
            request
        );
    }
    for value in [
        serde_json::json!({"kind":"video","positionMs":-1}),
        serde_json::json!({"kind":"video","positionMs":0,"path":"/tmp"}),
        serde_json::json!({"kind":"audio","startMs":0,"endMs":1}),
    ] {
        assert!(serde_json::from_value::<VisualRequest>(value).is_err());
    }
}
