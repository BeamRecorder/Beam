use beam_editor_domain::{Document, Project, protocol::*};
use serde_json::json;
mod job_types;
mod query_types;
mod read_types;
mod source_types;
#[path = "types.rs"]
mod types;
mod view_types;

#[test]
fn schema_contains_command_models_and_envelopes() {
    let value = schema().unwrap();
    for name in [
        "Request",
        "Response",
        "Transaction",
        "Operation",
        "Binding",
        "Definition",
        "Instance",
        "FrameRate",
        "RequestEnvelope",
        "ResponseEnvelope",
        "OwnerReady",
        "RecordingStyle",
        "TimelineRegion",
    ] {
        assert!(value["definitions"][name].is_object(), "missing {name}");
    }
    assert!(
        value["definitions"]["Request"]["oneOf"]
            .as_array()
            .unwrap()
            .len()
            >= 15
    );
}
#[test]
fn sequence_projection_has_counts_without_edit_content() {
    let document = Document::new(Project::new("API".into()));
    let view = SequenceInfo::from(&document.sequences[0]);
    assert_eq!(view.clip_count, 0);
    assert_eq!(view.track_count, 2);
    assert_eq!(view.duration_ms, 0);
    assert_eq!(
        view.recording_style,
        document.sequences[0].state.recording_style
    );
    let value = serde_json::to_value(view).unwrap();
    assert!(value.get("clips").is_none());
    assert!(value.get("undo").is_none());
}
#[test]
fn asset_projection_reports_telemetry_without_source_paths() {
    use beam_editor_domain::recording::style_types::CursorMode;
    for (cursor_mode, telemetry) in [
        (CursorMode::Separated, "separated"),
        (CursorMode::BakedIn, "bakedIn"),
        (CursorMode::Absent, "absent"),
        (CursorMode::Unknown, "unknown"),
    ] {
        let asset = beam_editor_domain::MediaAsset {
            id: uuid::Uuid::new_v4(),
            name: "Source".into(),
            path: "/private/source".into(),
            identity: None,
            duration_ms: 1000,
            width: 64,
            height: 64,
            has_video: true,
            has_audio: false,
            is_image: false,
            cursor: Default::default(),
            zooms: Default::default(),
            recording: true,
            cursor_mode,
        };
        let value = serde_json::to_value(AssetInfo::from(&asset)).unwrap();
        assert_eq!(value["telemetry"], telemetry);
        assert!(value.get("path").is_none());
        assert_eq!(value["recording"], true);
    }
}
#[test]
fn conflict_and_storage_errors_keep_stable_codes() {
    let conflict = ServiceError::from(&beam_editor_domain::EditorError::Conflict {
        expected: 4,
        actual: 5,
    });
    assert!(matches!(conflict.code, ErrorCode::Conflict));
    assert_eq!(conflict.expected_revision, Some(4));
    assert_eq!(conflict.actual_revision, Some(5));
    for error in [
        beam_editor_domain::EditorError::Invalid("invalid".into()),
        beam_editor_domain::EditorError::UnsupportedVersion(99),
        beam_editor_domain::EditorError::Media("missing plugin".into()),
        beam_editor_domain::EditorError::Stopped,
        beam_editor_domain::EditorError::Unauthorized("revoked".into()),
        beam_editor_domain::shared::storage("project", std::io::Error::other("disk failure")),
        beam_editor_domain::EditorError::Json(serde_json::from_str::<Request>("{").unwrap_err()),
    ] {
        let value = serde_json::to_value(ServiceError::from(&error)).unwrap();
        assert!(value["code"].is_string());
        assert_eq!(value["expectedRevision"], json!(null));
    }
}
