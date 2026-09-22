use beam_audio::AudioError;

#[test]
fn every_audio_failure_category_remains_distinguishable_in_the_manifest() {
    let errors = [
        AudioError::DeviceUnavailable("device".into()),
        AudioError::PermissionDenied("permission".into()),
        AudioError::Unsupported("format".into()),
        AudioError::Backend("backend".into()),
        AudioError::Clock("timestamp".into()),
    ];
    let messages: Vec<_> = errors.iter().map(ToString::to_string).collect();
    assert_eq!(messages.len(), 5);
    assert!(messages.iter().all(|message| !message.is_empty()));
    for (left, message) in messages.iter().enumerate() {
        assert!(messages.iter().skip(left + 1).all(|other| message != other));
    }
}

#[test]
fn cpal_error_kinds_map_to_the_correct_track_failure_category() {
    use cpal::ErrorKind;

    assert!(matches!(
        AudioError::from(cpal::Error::new(ErrorKind::PermissionDenied)),
        AudioError::PermissionDenied(_)
    ));
    assert!(matches!(
        AudioError::from(cpal::Error::new(ErrorKind::DeviceNotAvailable)),
        AudioError::DeviceUnavailable(_)
    ));
    for kind in [
        ErrorKind::UnsupportedConfig,
        ErrorKind::UnsupportedOperation,
    ] {
        assert!(matches!(
            AudioError::from(cpal::Error::new(kind)),
            AudioError::Unsupported(_)
        ));
    }
    assert!(matches!(
        AudioError::from(cpal::Error::new(ErrorKind::BackendError)),
        AudioError::Backend(_)
    ));
}
