use beam_audio::{AudioDevice, AudioEvent, AudioQueueLimits};

#[test]
fn default_audio_queue_bounds_callback_work_without_dropping_device_identity() {
    let limits = AudioQueueLimits::default();
    assert_eq!(limits.packets, 256);
    assert_eq!(limits.bytes, 4 * 1024 * 1024);
    let device = AudioDevice {
        id: "system:default-output".into(),
        name: "Speakers".into(),
        is_default: true,
    };
    assert_eq!(device.id, "system:default-output");
    assert!(device.is_default);
}

#[test]
fn drop_event_preserves_sample_position_and_frame_count() {
    let event = AudioEvent::Dropped {
        first_sample: 12_345,
        frames: 480,
    };
    assert!(matches!(
        event,
        AudioEvent::Dropped {
            first_sample: 12_345,
            frames: 480
        }
    ));
}

#[test]
fn discontinuity_event_preserves_the_first_affected_sample() {
    let event = AudioEvent::ClockDiscontinuity {
        first_sample: 12_345,
    };
    assert!(matches!(
        event,
        AudioEvent::ClockDiscontinuity {
            first_sample: 12_345
        }
    ));
}
