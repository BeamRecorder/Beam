use super::*;
use beam_editor_domain::{
    Clip, Effects, Track, TrackKind,
    animation::{Binding, Value},
    effects::Instance,
};
#[test]
fn clip_headers_keep_instance_identity_and_regions_without_parameter_payloads() {
    let instance = Instance {
        id: Uuid::new_v4(),
        name: Some("Named".into()),
        definition_id: "beam.color".into(),
        definition_version: 1,
        enabled: true,
        range: None,
        parameters: [(
            "brightness".into(),
            Binding::Constant {
                value: Value::Number(0.1),
            },
        )]
        .into(),
    };
    let clip = Clip {
        id: Uuid::new_v4(),
        asset_id: Uuid::new_v4(),
        track_id: Uuid::new_v4(),
        start_ms: 4,
        source_in_ms: 8,
        duration_ms: 100,
        effects: Effects::default(),
        cursor_style: None,
        instances: vec![instance.clone()],
        rate: Default::default(),
        animation_offset_ms: -1,
        generator: Some(instance.clone()),
        link_group: Some(Uuid::new_v4()),
        title: None,
    };
    let header = clip.header();
    let json = serde_json::to_value(&header).unwrap();
    assert_eq!(header.id(), clip.id());
    assert_eq!(header.instances[0].id, instance.id);
    assert_eq!(json["instances"][0]["name"], "Named");
    assert!(json["instances"][0].get("parameters").is_none());
    assert_eq!(json["animationOffsetMs"], -1);
    assert_eq!(json["title"], serde_json::Value::Null);
    let track = Track::new("Video".into(), TrackKind::Video);
    assert_eq!(track.header().id, track.id);
    assert_eq!(ItemHeader::id(&track.header()), PersistentItem::id(&track));
}
