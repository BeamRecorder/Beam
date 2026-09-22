#![cfg(test)]
#![allow(clippy::expect_used)]

use super::*;

#[test]
fn invalid_limits_reject_before_spawning_an_injected_worker() {
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
        let called = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let worker_called = called.clone();
        let result = open_system_audio_with_worker(
            None,
            SessionClock::start(),
            Arc::new(StartGate::new()),
            limits,
            move |_, _, _, _, _, _, _, _, _, _| {
                worker_called.store(true, Ordering::Release);
                Ok(())
            },
        );
        assert!(matches!(result, Err(AudioError::Unsupported(_))));
        assert!(!called.load(Ordering::Acquire));
    }
}

#[test]
fn injected_worker_ready_error_is_returned_before_capture_creation() {
    let result = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        |_, _, _, _, _, _, _, _, _, ready| {
            ready
                .send(Err(AudioError::Unsupported("format refused".into())))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            Ok(())
        },
    );
    assert!(matches!(
        result,
        Err(AudioError::Unsupported(reason)) if reason == "format refused"
    ));
}

#[test]
fn worker_exit_without_ready_returns_immediate_negotiation_error() {
    let result = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        |_, _, _, _, _, _, _, _, _, _| Ok(()),
    );
    assert!(matches!(
        result,
        Err(AudioError::Backend(reason)) if reason == "PipeWire audio format negotiation timed out"
    ));
}

#[test]
fn injected_worker_failure_reports_error_before_ready() {
    let result = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        |_, _, _, _, _, _, _, _, _, _| {
            Err(AudioError::Backend("PipeWire connection refused".into()))
        },
    );
    assert!(matches!(
        result,
        Err(AudioError::Backend(reason)) if reason.contains("PipeWire connection refused")
    ));
}

#[test]
#[allow(clippy::panic, reason = "exercise an injected worker panic")]
fn injected_worker_panic_is_reported_as_negotiation_failure() {
    let result = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        |_, _, _, _, _, _, _, _, _, _| std::panic::panic_any("injected panic"),
    );
    assert!(matches!(
        result,
        Err(AudioError::Backend(reason)) if reason == "PipeWire audio format negotiation timed out"
    ));
}

#[test]
fn valid_format_from_finished_worker_preserves_negotiated_capture() {
    let result = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        |commands, _, _, _, _, _, _, _, _, ready| {
            drop(commands);
            ready
                .send(Ok(stereo_format()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            Ok(())
        },
    );
    let mut capture = result.expect("negotiated capture");
    assert_eq!((capture.sample_rate, capture.channels), (48_000, 2));
    capture.halt().expect("finished worker");
}

#[test]
fn injected_worker_terminal_event_is_observable_after_ready() {
    let (release_tx, release_rx) = mpsc::sync_channel::<()>(1);
    let mut capture = open_system_audio_with_worker(
        Some("alsa_output.test".into()),
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        move |commands, _, _, terminal, _, target, _, _, byte_limit, ready| {
            assert_eq!(target.as_deref(), Some("alsa_output.test"));
            assert_eq!(byte_limit, AudioQueueLimits::default().bytes);
            terminal
                .try_send(AudioEvent::Failed("stream error".into()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            ready
                .send(Ok(stereo_format()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            release_rx
                .recv()
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            drop(commands);
            Ok(())
        },
    )
    .expect("prepared capture");
    assert_eq!((capture.sample_rate, capture.channels), (48_000, 2));
    assert!(matches!(
        capture.try_event(),
        Some(AudioEvent::Failed(reason)) if reason == "stream error"
    ));
    release_tx.send(()).expect("release worker");
    capture.halt().expect("stop completed worker");
}

#[test]
fn injected_worker_failure_after_ready_is_terminal_and_survives_stop() {
    let (release_tx, release_rx) = mpsc::sync_channel::<()>(1);
    let mut capture = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        move |commands, _, _, _, _, _, _, _, _, ready| {
            ready
                .send(Ok(stereo_format()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            release_rx
                .recv()
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            drop(commands);
            Err(AudioError::Backend("worker lost stream".into()))
        },
    )
    .expect("prepared capture");
    release_tx.send(()).expect("release worker");
    assert!(matches!(
        capture.halt(),
        Err(AudioError::Backend(reason)) if reason == "worker lost stream"
    ));
    assert!(matches!(
        capture.try_event(),
        Some(AudioEvent::Failed(reason)) if reason.contains("worker lost stream")
    ));
}

#[test]
fn completed_worker_leaves_queued_tail_available_until_consumed() {
    let (release_tx, release_rx) = mpsc::sync_channel::<()>(1);
    let mut capture = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits {
            packets: 2,
            bytes: 8,
        },
        move |commands, packets, _, _, queued_bytes, _, _, _, _, ready| {
            queued_bytes.store(8, Ordering::Release);
            packets
                .try_send(TimedAudioPacket {
                    packet: AudioPacket {
                        start_ns: 0,
                        sample_rate: 48_000,
                        channels: 2,
                        frames: 1,
                        data: vec![0.25, -0.5],
                    },
                    first_sample: 9,
                    native_capture_ns: Some(10),
                })
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            ready
                .send(Ok(stereo_format()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            release_rx
                .recv()
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            drop(commands);
            Ok(())
        },
    )
    .expect("prepared capture");
    assert_eq!(capture.queue_depth(), (1, 8));
    release_tx.send(()).expect("release worker");
    capture.halt().expect("worker completed");
    assert_eq!(capture.queue_depth(), (1, 8));
    let packet = capture
        .recv_packet_timeout(Duration::ZERO)
        .expect("read queued tail")
        .expect("queued packet");
    assert_eq!(packet.first_sample, 9);
    assert_eq!(packet.native_capture_ns, Some(10));
    assert_eq!(capture.queue_depth(), (0, 0));
    capture.stop().expect("already stopped");
}

#[test]
fn dropping_capture_sends_stop_to_worker_without_a_pipewire_server() {
    let observed = Arc::new(std::sync::Mutex::new(Vec::new()));
    let worker_observed = observed.clone();
    let capture = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        move |commands, _, _, _, _, _, _, _, _, ready| {
            pw::init();
            let mainloop = pw::main_loop::MainLoopRc::new(None)
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            let stop_loop = mainloop.clone();
            let attached = commands.attach(mainloop.loop_(), move |command| {
                let name = match command {
                    Command::Start => "start",
                    Command::Stop => "stop",
                };
                worker_observed.lock().expect("command log").push(name);
                if matches!(command, Command::Stop) {
                    stop_loop.quit();
                }
            });
            ready
                .send(Ok(stereo_format()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            mainloop.run();
            drop(attached);
            Ok(())
        },
    )
    .expect("capture with in-memory command loop");
    drop(capture);
    assert_eq!(*observed.lock().expect("command log"), ["start", "stop"]);
}

#[test]
fn injected_worker_terminal_event_precedes_regular_event() {
    let (release_tx, release_rx) = mpsc::sync_channel::<()>(1);
    let capture = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        move |commands, _, events, terminal, _, _, _, _, _, ready| {
            events
                .try_send(AudioEvent::Started)
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            terminal
                .try_send(AudioEvent::DeviceChanged("sink disappeared".into()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            ready
                .send(Ok(stereo_format()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            release_rx
                .recv()
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            drop(commands);
            Ok(())
        },
    )
    .expect("capture with events");
    assert!(matches!(
        capture.try_event(),
        Some(AudioEvent::DeviceChanged(reason)) if reason == "sink disappeared"
    ));
    assert!(matches!(capture.try_event(), Some(AudioEvent::Started)));
    release_tx.send(()).expect("release worker");
    capture.stop().expect("stop worker");
}

#[test]
fn worker_failure_after_ready_preserves_packet_tail_and_terminal_error() {
    let (release_tx, release_rx) = mpsc::sync_channel::<()>(1);
    let mut capture = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits {
            packets: 1,
            bytes: 8,
        },
        move |commands, packets, _, _, queued_bytes, _, _, _, _, ready| {
            queued_bytes.store(8, Ordering::Release);
            packets
                .try_send(TimedAudioPacket {
                    packet: AudioPacket {
                        start_ns: 10,
                        sample_rate: 48_000,
                        channels: 2,
                        frames: 1,
                        data: vec![0.5, -0.5],
                    },
                    first_sample: 20,
                    native_capture_ns: None,
                })
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            ready
                .send(Ok(stereo_format()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            release_rx
                .recv()
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            drop(commands);
            Err(AudioError::Backend(
                "stream failed after first packet".into(),
            ))
        },
    )
    .expect("capture with queued packet");
    release_tx.send(()).expect("release worker");
    assert!(capture.halt().is_err());
    assert!(matches!(capture.try_event(), Some(AudioEvent::Failed(_))));
    let tail = capture
        .try_packet()
        .expect("queue read")
        .expect("tail packet");
    assert_eq!(tail.first_sample, 20);
    assert_eq!(tail.packet.data, [0.5, -0.5]);
    assert_eq!(capture.queue_depth(), (0, 0));
    assert!(matches!(
        capture.try_packet(),
        Err(AudioError::Backend(reason)) if reason == "PipeWire packet producer disconnected"
    ));
}

#[test]
fn explicit_ready_error_takes_precedence_over_worker_failure() {
    let result = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        |_, _, _, _, _, _, _, _, _, ready| {
            ready
                .send(Err(AudioError::Unsupported(
                    "negotiated format invalid".into(),
                )))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            Err(AudioError::Backend("worker also failed".into()))
        },
    );
    assert!(matches!(
        result,
        Err(AudioError::Unsupported(reason)) if reason == "negotiated format invalid"
    ));
}

#[test]
#[allow(clippy::panic, reason = "exercise a worker panic after readiness")]
fn worker_panic_after_ready_is_reported_at_halt_and_consumed_once() {
    let (release_tx, release_rx) = mpsc::sync_channel::<()>(1);
    let mut capture = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        move |commands, _, _, _, _, _, _, _, _, ready| {
            ready
                .send(Ok(stereo_format()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            release_rx
                .recv()
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            drop(commands);
            std::panic::panic_any("post-ready worker panic");
        },
    )
    .expect("capture prepared");
    release_tx.send(()).expect("release worker");
    assert!(matches!(
        capture.halt(),
        Err(AudioError::Backend(reason)) if reason == "PipeWire thread panicked"
    ));
    capture.halt().expect("panic joined only once");
}

#[test]
fn worker_failure_cannot_replace_an_existing_terminal_event() {
    let (release_tx, release_rx) = mpsc::sync_channel::<()>(1);
    let mut capture = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        move |commands, _, _, terminal, _, _, _, _, _, ready| {
            terminal
                .try_send(AudioEvent::DeviceChanged("selected output removed".into()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            ready
                .send(Ok(stereo_format()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            release_rx
                .recv()
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            drop(commands);
            Err(AudioError::Backend("worker shutdown failed".into()))
        },
    )
    .expect("capture prepared");
    release_tx.send(()).expect("release worker");
    assert!(matches!(
        capture.halt(),
        Err(AudioError::Backend(reason)) if reason == "worker shutdown failed"
    ));
    assert!(matches!(
        capture.try_event(),
        Some(AudioEvent::DeviceChanged(reason)) if reason == "selected output removed"
    ));
    assert!(capture.try_event().is_none());
}

#[test]
#[allow(
    clippy::panic,
    reason = "exercise a failing worker during capture drop"
)]
fn dropping_capture_swallows_a_worker_panic_after_ready() {
    let (release_tx, release_rx) = mpsc::sync_channel::<()>(1);
    let worker_panicked = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let observed = worker_panicked.clone();
    let capture = open_system_audio_with_worker(
        None,
        SessionClock::start(),
        Arc::new(StartGate::new()),
        AudioQueueLimits::default(),
        move |commands, _, _, _, _, _, _, _, _, ready| {
            ready
                .send(Ok(stereo_format()))
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            release_rx
                .recv()
                .map_err(|error| AudioError::Backend(error.to_string()))?;
            drop(commands);
            observed.store(true, Ordering::Release);
            std::panic::panic_any("worker panics during capture drop");
        },
    )
    .expect("capture prepared");
    release_tx.send(()).expect("release worker");
    drop(capture);
    assert!(worker_panicked.load(Ordering::Acquire));
}
