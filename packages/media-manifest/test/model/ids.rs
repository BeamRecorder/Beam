#![allow(clippy::expect_used)]

use beam_media_manifest::{ManifestError, ProjectId, SegmentId, SessionId, SourceId, TrackId};

#[test]
fn invalid_source_ids_fail_explicitly() {
    for invalid in ["", "  "] {
        assert!(matches!(
            SourceId::new(invalid),
            Err(ManifestError::InvalidSourceId)
        ));
    }
    assert!(matches!(
        SourceId::new("x".repeat(1025)),
        Err(ManifestError::InvalidSourceId)
    ));
    assert_eq!(
        SourceId::new("camera:one").expect("valid").as_str(),
        "camera:one"
    );
}

#[test]
fn typed_ids_round_trip_without_losing_their_uuid() {
    macro_rules! round_trip {
        ($kind:ty) => {{
            let id = <$kind>::new();
            let parsed: $kind = id.to_string().parse().expect("parse id");
            assert_eq!(parsed.as_uuid(), id.as_uuid());
            assert_eq!(
                serde_json::to_string(&id).expect("JSON"),
                format!("\"{id}\"")
            );
        }};
    }
    round_trip!(ProjectId);
    round_trip!(SessionId);
    round_trip!(TrackId);
    round_trip!(SegmentId);
}

#[test]
fn default_ids_are_unique_and_malformed_uuids_are_rejected() {
    let first = ProjectId::default();
    let second = ProjectId::default();
    assert_ne!(first, second);
    assert!("not-a-uuid".parse::<ProjectId>().is_err());
}

#[test]
fn source_id_preserves_an_opaque_1024_byte_device_identifier() {
    let raw = "x".repeat(1024);
    let id = SourceId::new(raw.clone()).expect("maximal ID");
    assert_eq!(id.to_string(), raw);
    assert_eq!(
        serde_json::to_string(&id).expect("JSON"),
        format!("\"{raw}\"")
    );
}
