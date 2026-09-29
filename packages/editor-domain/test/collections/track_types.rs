use beam_editor_domain::{
    Track, TrackKind,
    animation::{Binding, Interpolation, Keyframe, Value},
    collections::{ItemHeader, PersistentItem, TrackHeader},
    effects::{catalog, definition},
    timing::{Time, TimeRange, TimeSpace},
};

#[test]
fn track_headers_expose_regions_and_key_identities_without_parameter_payloads() {
    let mut track = Track::new("Lane".into(), TrackKind::Video);
    let mut effect = definition(&catalog::builtins(), "beam.opacity", 2)
        .unwrap()
        .instantiate();
    effect.name = Some("Lane fade".into());
    effect.range = Some(TimeRange {
        space: TimeSpace::Sequence,
        start: Time::ZERO,
        end: Time::milliseconds(1000),
    });
    let key = Keyframe {
        id: uuid::Uuid::new_v4(),
        time: Time::ZERO,
        value: Value::Number(0.5),
        interpolation: Interpolation::Linear,
    };
    effect.parameters.insert(
        "opacity".into(),
        Binding::Curve {
            space: TimeSpace::Sequence,
            keys: vec![key.clone()],
        },
    );
    track.instances.push(effect.clone());
    let header = track.header();
    let json = serde_json::to_value(&header).unwrap();
    assert_eq!(header.identities(), vec![track.id, effect.id, key.id]);
    assert!(json["instances"][0].get("parameters").is_none());
    assert_eq!(json["instances"][0]["name"], "Lane fade");
    assert_eq!(header.instances[0].range, effect.range);
    let old: TrackHeader = serde_json::from_value(serde_json::json!({
        "id":track.id,"name":"Lane","kind":"video","muted":false,"hidden":false
    }))
    .unwrap();
    assert!(old.instances.is_empty() && old.keyframe_ids.is_empty());
}
