use beam_editor_domain::protocol::*;
use serde_json::json;
#[test]
fn opaque_import_and_destination_requests_reject_paths_and_unknown_fields() {
    for value in [
        json!({"method":"import","paths":["/etc/passwd"]}),
        json!({"method":"open","projectGrant":"id","path":".."}),
        json!({"method":"export","destinationGrant":"id","fileName":"x.webm","container":"avi"}),
    ] {
        assert!(serde_json::from_value::<Request>(value).is_err());
    }
    let request: Request = serde_json::from_value(
        json!({"method":"export","destinationGrant":"id","fileName":"x.webm","container":"webm","context":{"projectId":uuid::Uuid::new_v4(),"sequenceId":uuid::Uuid::new_v4(),"expectedRevision":0,"idempotencyKey":"export-1"}}),
    )
    .unwrap();
    assert!(matches!(
        request,
        Request::Export {
            container: Container::Webm,
            ..
        }
    ));
}
#[test]
fn envelopes_preserve_ids_and_deny_unversioned_payloads() {
    let request = RequestEnvelope {
        api_version: API_VERSION,
        request_id: "call-1".into(),
        token: "private".into(),
        request: Request::Discovery,
    };
    let round_trip: RequestEnvelope =
        serde_json::from_slice(&serde_json::to_vec(&request).unwrap()).unwrap();
    assert_eq!(round_trip.request_id, "call-1");
    assert!(
        serde_json::from_value::<RequestEnvelope>(
            json!({"requestId":"x","request":{"method":"discovery"}})
        )
        .is_err()
    );
    let response = ResponseEnvelope {
        api_version: API_VERSION,
        request_id: "call-1".into(),
        response: Response::Acknowledged,
    };
    assert_eq!(
        serde_json::to_value(response).unwrap()["response"]["type"],
        "acknowledged"
    );
}
#[test]
fn all_page_queries_are_typed() {
    for kind in ["assets", "sequences", "definitions"] {
        let query: Query =
            serde_json::from_value(json!({"kind":kind,"offset":0,"limit":256})).unwrap();
        assert_eq!(serde_json::to_value(query).unwrap()["limit"], 256);
    }
    assert!(serde_json::from_value::<Query>(json!({"kind":"clips","offset":0,"limit":1})).is_err());
    let sequence_id = uuid::Uuid::new_v4();
    let clip_id = uuid::Uuid::new_v4();
    let time = json!({"ticks":0,"timescale":1000});
    for value in [
        json!({"kind":"regions","sequenceId":sequence_id,"start":time,"end":{"ticks":1000,"timescale":1000},"offset":0,"limit":256}),
        json!({"kind":"parameterValues","sequenceId":sequence_id,"clipId":clip_id,"time":time}),
    ] {
        let query: Query = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(query).unwrap(), value);
    }
}
