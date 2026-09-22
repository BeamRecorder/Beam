#![allow(clippy::expect_used)]

use super::*;
use cpal::{ErrorKind, SupportedBufferSize};

mod fake;
use fake::{FakeDevice, FakeHost, RequestedConfig, device, host};

fn config(format: SampleFormat, rate: u32) -> SupportedStreamConfig {
    SupportedStreamConfig::new(2, rate, SupportedBufferSize::Unknown, format)
}

fn range(format: SampleFormat, min: u32, max: u32) -> SupportedStreamConfigRange {
    SupportedStreamConfigRange::new(2, min, max, SupportedBufferSize::Unknown, format)
}

fn microphone(fake: FakeDevice) -> Result<AudioCapture, AudioError> {
    let key = fake.key;
    open_microphone_with_host(
        &host(FakeHost::new(vec![fake], Some(key))),
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
    )
}

#[test]
fn custom_host_lists_named_inputs_and_marks_only_the_default_id() {
    let first = FakeDevice::new("mic-a", "Studio microphone");
    let second = FakeDevice::new("mic-b", "USB microphone");
    let devices = list_inputs_with_host(&host(FakeHost::new(vec![first, second], Some("mic-b"))))
        .expect("microphone catalogue");
    assert_eq!(devices.len(), 2);
    assert_eq!(devices[0].id, "custom:mic-a");
    assert_eq!(devices[0].name, "Studio microphone");
    assert!(!devices[0].is_default);
    assert_eq!(devices[1].id, "custom:mic-b");
    assert_eq!(devices[1].name, "USB microphone");
    assert!(devices[1].is_default);
}

#[test]
fn custom_host_without_default_lists_inputs_as_nondefault() {
    let devices = list_inputs_with_host(&host(FakeHost::new(
        vec![FakeDevice::new("mic-a", "A")],
        None,
    )))
    .expect("catalogue without default");
    assert_eq!(devices.len(), 1);
    assert!(!devices[0].is_default);
    assert!(
        list_inputs_with_host(&host(FakeHost::new(Vec::new(), None)))
            .expect("empty catalogue")
            .is_empty()
    );
}

#[test]
fn default_id_failure_does_not_invent_a_default_input() {
    let mut failed_default = FakeDevice::new("mic-a", "A");
    failed_default.id_error = Some(ErrorKind::DeviceNotAvailable);
    let listed = FakeDevice::new("mic-b", "B");
    let mut fake_host = FakeHost::new(vec![listed], Some("mic-a"));
    fake_host.default_input_override = Some(failed_default);
    let devices = list_inputs_with_host(&host(fake_host)).expect("listed input");
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].id, "custom:mic-b");
    assert!(!devices[0].is_default);
}

#[test]
fn input_catalogue_reports_enumeration_id_and_description_errors() {
    let mut unavailable = FakeHost::new(vec![], None);
    unavailable.enumeration_error = Some(ErrorKind::HostUnavailable);
    assert!(list_inputs_with_host(&host(unavailable)).is_err());

    let mut missing_id = FakeDevice::new("mic-a", "A");
    missing_id.id_error = Some(ErrorKind::DeviceNotAvailable);
    assert!(list_inputs_with_host(&host(FakeHost::new(vec![missing_id], None))).is_err());

    let mut missing_name = FakeDevice::new("mic-b", "B");
    missing_name.description_error = Some(ErrorKind::DeviceNotAvailable);
    assert!(list_inputs_with_host(&host(FakeHost::new(vec![missing_name], None))).is_err());
}

#[test]
fn selected_default_and_explicit_input_use_the_requested_device() {
    let first = FakeDevice::new("mic-a", "A");
    let second = FakeDevice::new("mic-b", "B");
    let h = host(FakeHost::new(vec![first, second], Some("mic-a")));
    assert_eq!(
        select_device(&h, None, false)
            .expect("default input")
            .id()
            .expect("id")
            .to_string(),
        "custom:mic-a"
    );
    assert_eq!(
        select_device(&h, Some("custom:mic-b"), false)
            .expect("explicit input")
            .id()
            .expect("id")
            .to_string(),
        "custom:mic-b"
    );
}

#[test]
fn absent_or_malformed_input_id_is_reported_without_opening_stream() {
    let h = host(FakeHost::new(vec![FakeDevice::new("mic-a", "A")], None));
    assert!(matches!(
        select_device(&h, None, false),
        Err(AudioError::DeviceUnavailable(id)) if id == "default"
    ));
    assert!(matches!(
        select_device(&h, Some("custom:missing"), false),
        Err(AudioError::DeviceUnavailable(id)) if id == "custom:missing"
    ));
    assert!(select_device(&h, Some("no-host-prefix"), false).is_err());
}

#[test]
fn selection_rejects_wrong_direction_and_accepts_output_only() {
    let mut output = FakeDevice::new("speakers", "Speakers");
    output.input = false;
    output.output = true;
    let mut fake_host = FakeHost::new(vec![output], None);
    fake_host.default_output = Some("speakers");
    let h = host(fake_host);
    assert!(matches!(
        select_device(&h, Some("custom:speakers"), false),
        Err(AudioError::Unsupported(_))
    ));
    assert_eq!(
        select_device(&h, None, true)
            .expect("default output")
            .id()
            .expect("id")
            .to_string(),
        "custom:speakers"
    );
}

#[test]
fn preferred_config_uses_supported_default_float_or_integer_without_range_lookup() {
    for format in [SampleFormat::F32, SampleFormat::I16] {
        let mut fake = FakeDevice::new("mic-a", "A");
        fake.default_input = config(format, 96_000);
        fake.input_ranges_error = Some(ErrorKind::DeviceNotAvailable);
        let chosen = preferred_config(&device(fake), false).expect("default config");
        assert_eq!(chosen.sample_format(), format);
        assert_eq!(chosen.sample_rate(), 96_000);
    }
}

#[test]
fn preferred_config_uses_output_config_and_float_fallback() {
    let mut fake = FakeDevice::new("speakers", "Speakers");
    fake.output = true;
    fake.default_output = config(SampleFormat::U16, 96_000);
    fake.output_ranges = vec![
        range(SampleFormat::I16, 44_100, 96_000),
        range(SampleFormat::F32, 44_100, 48_000),
    ];
    let chosen = preferred_config(&device(fake), true).expect("float output fallback");
    assert_eq!(chosen.sample_format(), SampleFormat::F32);
    assert_eq!(chosen.sample_rate(), 48_000);
}

#[test]
fn preferred_config_propagates_default_and_range_errors() {
    let mut bad_default = FakeDevice::new("mic-a", "A");
    bad_default.default_input_error = Some(ErrorKind::UnsupportedConfig);
    assert!(preferred_config(&device(bad_default), false).is_err());

    let mut bad_ranges = FakeDevice::new("mic-b", "B");
    bad_ranges.default_input = config(SampleFormat::U16, 48_000);
    bad_ranges.input_ranges_error = Some(ErrorKind::DeviceNotAvailable);
    assert!(preferred_config(&device(bad_ranges), false).is_err());

    let mut no_fallback = FakeDevice::new("mic-c", "C");
    no_fallback.default_input = config(SampleFormat::U16, 48_000);
    no_fallback.input_ranges = vec![range(SampleFormat::U16, 44_100, 96_000)];
    assert!(matches!(
        preferred_config(&device(no_fallback), false),
        Err(AudioError::Unsupported(_))
    ));
}

#[test]
fn invalid_queue_limits_reject_before_custom_stream_build() {
    for limits in [
        AudioQueueLimits {
            packets: 0,
            bytes: 8,
        },
        AudioQueueLimits {
            packets: 1,
            bytes: 0,
        },
    ] {
        let fake = FakeDevice::new("mic-a", "A");
        let controls = fake.controls.clone();
        let result = open_input(
            device(fake),
            config(SampleFormat::F32, 48_000),
            SessionClock::start(),
            Arc::new(StartGate::new()),
            limits,
        );
        assert!(matches!(result, Err(AudioError::Unsupported(_))));
        assert_eq!(controls.built(), 0);
    }
}

#[test]
fn custom_microphone_reports_build_and_play_errors() {
    let mut build_failed = FakeDevice::new("mic-a", "A");
    build_failed.build_error = Some(ErrorKind::PermissionDenied);
    let build_controls = build_failed.controls.clone();
    assert!(microphone(build_failed).is_err());
    assert_eq!(build_controls.built(), 1);
    assert_eq!(build_controls.played(), 0);

    let mut play_failed = FakeDevice::new("mic-b", "B");
    play_failed.play_error = Some(ErrorKind::DeviceNotAvailable);
    let play_controls = play_failed.controls.clone();
    assert!(microphone(play_failed).is_err());
    assert_eq!(play_controls.built(), 1);
    assert_eq!(play_controls.played(), 1);
}

#[test]
fn custom_microphone_preserves_config_callback_samples_and_pause() {
    let fake = FakeDevice::new("mic-a", "Studio Mic");
    let controls = fake.controls.clone();
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    let mut capture = open_microphone_with_host(
        &host(FakeHost::new(vec![fake], Some("mic-a"))),
        None,
        clock.clone(),
        gate.clone(),
        AudioQueueLimits::default(),
    )
    .expect("custom microphone");
    assert_eq!((capture.sample_rate, capture.channels), (48_000, 2));
    assert_eq!(controls.built(), 1);
    assert_eq!(controls.played(), 1);
    assert_eq!(
        *controls.requested_config.lock().expect("config lock"),
        Some(RequestedConfig {
            channels: 2,
            sample_rate: 48_000,
            format: SampleFormat::F32,
            timeout: Some(Duration::from_secs(10)),
        })
    );
    controls.emit_f32(&mut [0.25, -0.5]);
    assert_eq!(capture.queue_depth(), (0, 0));
    gate.release(clock.now_ns()).expect("start gate");
    controls.emit_f32(&mut [0.25, -0.5]);
    assert_eq!(capture.queue_depth(), (1, 8));
    let packet = capture.try_packet().expect("packet read").expect("packet");
    assert_eq!(packet.packet.data, [0.25, -0.5]);
    assert_eq!(packet.first_sample, 0);
    assert_eq!(packet.native_capture_ns, Some(1_000_000_000));
    assert_eq!(capture.queue_depth(), (0, 0));
    assert!(matches!(
        capture.try_event(),
        Some(AudioEvent::Anchor { .. })
    ));
    assert!(matches!(capture.try_event(), Some(AudioEvent::Started)));
    capture.halt().expect("pause custom stream");
    assert_eq!(controls.paused(), 1);
    capture.stop().expect("stop custom stream");
    assert_eq!(controls.paused(), 2);
}

#[test]
fn custom_stream_errors_use_terminal_priority_and_pause_failure_propagates() {
    let mut fake = FakeDevice::new("mic-a", "A");
    fake.pause_error = Some(ErrorKind::DeviceNotAvailable);
    let controls = fake.controls.clone();
    let mut capture = microphone(fake).expect("custom stream");
    controls.emit_error(ErrorKind::DeviceNotAvailable);
    assert!(matches!(
        capture.try_event(),
        Some(AudioEvent::Disconnected(_))
    ));
    controls.emit_error(ErrorKind::DeviceChanged);
    assert!(matches!(
        capture.try_event(),
        Some(AudioEvent::DeviceChanged(_))
    ));
    controls.emit_error(ErrorKind::BackendError);
    assert!(matches!(capture.try_event(), Some(AudioEvent::Failed(_))));
    assert!(capture.halt().is_err());
    assert_eq!(controls.paused(), 1);
}
