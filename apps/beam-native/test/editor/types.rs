use super::types::*;
use serde_json::json;

#[test]
fn valid_edit_transport_and_export_requests_are_typed() {
    let edit: EditRequest =
        serde_json::from_value(json!({"revision":3,"edit":{"type":"undo"}})).unwrap();
    assert_eq!(edit.revision, 3);
    assert!(matches!(edit.edit, beam_editor_engine::Edit::Undo {}));
    let seek: SeekRequest = serde_json::from_value(json!({"positionMs":0})).unwrap();
    assert_eq!(seek.position_ms, 0);
    let play: PlayRequest = serde_json::from_value(json!({"playing":true})).unwrap();
    assert!(play.playing);
    let export: ExportRequest = serde_json::from_value(json!({"container":"mp4"})).unwrap();
    assert_eq!(export.container.extension(), "mp4");
}

#[test]
fn paths_unknown_fields_wrong_types_and_negative_times_are_rejected() {
    assert!(
        serde_json::from_value::<EditRequest>(
            json!({"revision":0,"edit":{"type":"undo","path":"/tmp"}})
        )
        .is_err()
    );
    assert!(serde_json::from_value::<SeekRequest>(json!({"positionMs":-1})).is_err());
    assert!(serde_json::from_value::<SeekRequest>(json!({"positionMs":0,"path":"/tmp"})).is_err());
    assert!(serde_json::from_value::<PlayRequest>(json!({"playing":"true"})).is_err());
    assert!(serde_json::from_value::<PlayRequest>(json!({"playing":true,"path":"/tmp"})).is_err());
    assert!(
        serde_json::from_value::<ExportRequest>(
            json!({"container":"mp4","destination":"/tmp/overwrite"})
        )
        .is_err()
    );
    assert!(serde_json::from_value::<ExportRequest>(json!({"container":"unknown"})).is_err());
}

#[test]
fn frame_response_contains_only_transport_and_registered_gpu_canvas_identity() {
    let response = FrameResult {
        transport: beam_editor_engine::Transport {
            position_ms: 7,
            duration_ms: 9,
            playing: false,
            error: None,
        },
        canvas_id: Some(42),
    };
    assert_eq!(
        serde_json::to_value(response).unwrap(),
        json!({
            "transport":{"positionMs":7,"durationMs":9,"playing":false,"error":null},
            "canvasId":42
        })
    );
}

#[test]
fn quality_accepts_only_narrow_native_arguments() {
    let quality: QualityRequest = serde_json::from_value(json!({"quality":"full"})).unwrap();
    assert_eq!(quality.quality.divisor(), 1);
    assert!(serde_json::from_value::<QualityRequest>(json!({"quality":"unknown"})).is_err());
    assert!(
        serde_json::from_value::<QualityRequest>(json!({"quality":"full","path":"/tmp"})).is_err()
    );
}
