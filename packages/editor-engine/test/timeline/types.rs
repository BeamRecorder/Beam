use beam_editor_engine::{Edit, Effects, Track, TrackKind};
#[test]
fn edit_protocol_is_typed_and_rejects_unknown_or_missing_fields() {
    let edit: Edit = serde_json::from_str(
        r#"{"type":"split","id":"00000000-0000-4000-8000-000000000001","timeMs":250}"#,
    )
    .unwrap();
    assert!(matches!(edit, Edit::Split { time_ms: 250, .. }));
    for value in [
        r#"{"type":"undo","path":"/tmp"}"#,
        r#"{"type":"rename"}"#,
        r#"{"type":"unknown"}"#,
    ] {
        assert!(serde_json::from_str::<Edit>(value).is_err());
    }
}
#[test]
fn effects_defaults_preserve_the_source_and_beam_automatic_zoom() {
    let value = Effects::default();
    assert_eq!(value.scale, 1.);
    assert_eq!(value.opacity, 1.);
    assert_eq!(value.volume, 1.);
    assert!(value.auto_zoom);
    assert_eq!(
        serde_json::from_value::<Effects>(serde_json::to_value(&value).unwrap()).unwrap(),
        value
    );
}
#[test]
fn lanes_have_independent_identity_mute_and_visibility() {
    let first = Track::new("Video".into(), TrackKind::Video);
    let second = Track::new("Video".into(), TrackKind::Video);
    assert_ne!(first.id, second.id);
    assert!(!first.hidden && !first.muted);
    assert_eq!(serde_json::to_value(first.kind).unwrap(), "video");
}
