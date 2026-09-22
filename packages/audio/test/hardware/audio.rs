#![allow(clippy::expect_used)]

use std::{
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use beam_audio::{
    AudioQueueLimits, list_inputs, list_system_outputs, open_microphone, open_system_audio,
};
use beam_media_core::{MonotonicClock, SessionClock, StartGate};

#[test]
#[ignore = "requires a real microphone, system output, and OS audio permission"]
fn capture_two_independent_native_audio_streams() {
    let microphone_id = list_inputs()
        .expect("microphone discovery")
        .into_iter()
        .find(|device| device.is_default)
        .expect("default microphone")
        .id;
    let output_id = list_system_outputs()
        .expect("output discovery")
        .into_iter()
        .find(|device| device.is_default)
        .expect("default output")
        .id;
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    let microphone = open_microphone(
        Some(&microphone_id),
        clock.clone(),
        gate.clone(),
        AudioQueueLimits::default(),
    )
    .expect("microphone stream");
    let system = open_system_audio(
        Some(&output_id),
        clock.clone(),
        gate.clone(),
        AudioQueueLimits::default(),
    )
    .expect("system output stream");
    gate.release(clock.now_ns()).expect("start gate");
    assert!(microphone.queue_depth().0 <= AudioQueueLimits::default().packets);
    assert!(system.queue_depth().0 <= AudioQueueLimits::default().packets);
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut mic_frames = 0_u64;
    let mut system_frames = 0_u64;
    while Instant::now() < deadline && (mic_frames == 0 || system_frames == 0) {
        if let Some(packet) = microphone
            .recv_packet_timeout(Duration::from_millis(10))
            .expect("microphone packet")
        {
            mic_frames += u64::from(packet.packet.frames);
        }
        if let Some(packet) = system
            .recv_packet_timeout(Duration::from_millis(10))
            .expect("system packet")
        {
            system_frames += u64::from(packet.packet.frames);
        }
        thread::sleep(Duration::from_millis(10));
    }
    assert!(
        mic_frames > 0 && system_frames > 0,
        "both audio streams must produce samples"
    );
    while let Some(event) = microphone.try_event().or_else(|| system.try_event()) {
        assert!(
            !matches!(
                &event,
                beam_audio::AudioEvent::Failed(_) | beam_audio::AudioEvent::Disconnected(_)
            ),
            "audio capture reported {event:?}"
        );
    }
    microphone.try_packet().expect("drain microphone queue");
    system.try_packet().expect("drain system queue");
    gate.close();
    microphone.stop().expect("microphone stop");
    system.stop().expect("system audio stop");
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "requires a running PipeWire server and a selectable output sink"]
fn capture_one_explicit_pipewire_output() {
    let output_id = std::env::var("BEAM_TEST_SYSTEM_OUTPUT_ID")
        .ok()
        .or_else(|| {
            list_system_outputs()
                .expect("output discovery")
                .into_iter()
                .find(|device| !device.is_default)
                .map(|device| device.id)
        });
    let output_id = output_id.expect("named PipeWire output");
    let clock = SessionClock::start();
    let gate = Arc::new(StartGate::new());
    let capture = open_system_audio(
        Some(&output_id),
        clock.clone(),
        gate.clone(),
        AudioQueueLimits::default(),
    )
    .expect("selected output stream");
    gate.release(clock.now_ns()).expect("start gate");
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut received = false;
    while Instant::now() < deadline && !received {
        received = capture
            .recv_packet_timeout(Duration::from_millis(20))
            .expect("selected output packet")
            .is_some_and(|packet| packet.packet.frames > 0);
    }
    assert!(
        received,
        "selected PipeWire output produced no audio frames"
    );
    gate.close();
    capture.stop().expect("selected output stop");
}
