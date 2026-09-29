use beam_editor_engine::video::zoom::types::{Camera, Follow, Velocity, Zoom};
#[test]
fn neutral_camera_and_follow_have_no_unrecorded_motion() {
    assert_eq!(
        Camera::default(),
        Camera {
            x: 0.5,
            y: 0.5,
            scale: 1.
        }
    );
    assert!(!Follow::default().initialized);
    assert_eq!(Velocity::default().scale, 0.);
}
#[test]
fn source_time_zoom_round_trips_through_project_json() {
    let zoom = Zoom {
        start_ms: 100,
        end_ms: 1500,
        cx: 0.7,
        cy: 0.4,
        scale: 1.5,
    };
    assert_eq!(
        serde_json::from_value::<Zoom>(serde_json::to_value(&zoom).unwrap()).unwrap(),
        zoom
    );
}
#[test]
fn unknown_zoom_fields_are_rejected() {
    assert!(
        serde_json::from_str::<Zoom>(
            r#"{"startMs":1,"endMs":2,"cx":0.5,"cy":0.5,"scale":1.5,"script":"x"}"#
        )
        .is_err()
    );
}
