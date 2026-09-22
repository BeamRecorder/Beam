use beam_camera::CameraError;

#[test]
fn camera_failure_messages_keep_their_kind_for_track_diagnostics() {
    let errors = [
        CameraError::DeviceUnavailable("device".into()),
        CameraError::PermissionDenied("permission".into()),
        CameraError::UnsupportedFormat("format".into()),
        CameraError::InvalidBuffer("buffer".into()),
        CameraError::Backend("backend".into()),
        CameraError::Clock("clock".into()),
    ];
    let messages: Vec<_> = errors.iter().map(ToString::to_string).collect();
    assert!(messages.iter().all(|message| message.contains(':')));
    assert_eq!(messages.len(), 6);
    for (index, message) in messages.iter().enumerate() {
        assert!(
            messages
                .iter()
                .skip(index + 1)
                .all(|other| other != message)
        );
    }
}
