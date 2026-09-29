use beam_editor_domain::protocol::{ReadTarget, Response, TimelineRegion};
use serde_json::json;
use uuid::Uuid;

#[test]
fn read_addresses_roundtrip_real_uuids_with_camel_case_and_no_fake_clip() {
    let sequence_id = Uuid::new_v4();
    let id = Uuid::new_v4();
    for value in [
        json!({"kind":"clip","sequenceId":sequence_id,"clipId":id}),
        json!({"kind":"track","sequenceId":sequence_id,"trackId":id}),
        json!({"kind":"sequence","sequenceId":sequence_id}),
    ] {
        let target: ReadTarget = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(target.sequence_id(), sequence_id);
        assert_eq!(serde_json::to_value(target).unwrap(), value);
        let region = json!({"id":id,"target":target,"definitionId":"beam.opacity","definitionVersion":2,"name":null,"kind":"effect","start":{"ticks":0,"timescale":1000},"end":{"ticks":1,"timescale":1000},"enabled":true});
        let decoded: TimelineRegion = serde_json::from_value(region.clone()).unwrap();
        assert_eq!(decoded.target, target);
        assert_eq!(serde_json::to_value(decoded).unwrap(), region);
        let response = json!({"type":"scopedParameterValues","revision":7,"target":target,"time":{"ticks":1,"timescale":1000},"values":{}});
        assert_eq!(
            serde_json::to_value(serde_json::from_value::<Response>(response.clone()).unwrap())
                .unwrap(),
            response
        );
    }
    for value in [
        json!({"kind":"track","sequenceId":sequence_id,"clipId":id}),
        json!({"kind":"sequence","sequenceId":sequence_id,"path":"/private"}),
        json!({"kind":"clip","clipId":id}),
    ] {
        assert!(serde_json::from_value::<ReadTarget>(value).is_err());
    }
}

#[test]
fn schema_read_targets_use_the_same_explicit_field_names_as_serde() {
    let schema = beam_editor_domain::protocol::schema().unwrap();
    let targets = schema["definitions"]["ReadTarget"]["oneOf"]
        .as_array()
        .unwrap();
    assert_eq!(targets.len(), 3);
    for variant in targets {
        let properties = variant["properties"].as_object().unwrap();
        assert!(properties.contains_key("sequenceId"));
        assert!(!properties.contains_key("sequence_id"));
        assert!(!properties.contains_key("clip_id"));
        assert!(!properties.contains_key("track_id"));
    }
}
