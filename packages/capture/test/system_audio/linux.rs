#![cfg(test)]
#![allow(clippy::expect_used)]

use super::format::{parse_audio_format_event, peak_f32le};

use std::io::Cursor;

use pipewire::spa;
use spa::{
    param::{ParamType, format::MediaSubtype, format::MediaType},
    pod::{Pod, Value},
};

use super::writer::writer_worker;
use super::*;
use crate::system_audio::wav::FloatWavWriter;
use std::thread;

fn lifecycle_fixture(
    initial_path: &std::path::Path,
) -> Result<PipewireSystemAudioRecording, Box<dyn std::error::Error>> {
    let format = SystemAudioFormat {
        sample_rate: 48_000,
        channels: 2,
    };
    let gate = Arc::new(StartGate::new());
    gate.release(0)?;
    let (commands, incoming) = pw::channel::channel();
    let (ready, prepared) = mpsc::sync_channel(1);
    let (sink, receiver) = crossbeam_channel::bounded(8);
    let fatal = Arc::new(Mutex::new(None));
    let writer_fatal = fatal.clone();
    let writer = FloatWavWriter::create(initial_path, format)?;
    let writer_thread =
        thread::spawn(move || writer_worker(receiver, format, Some(writer), writer_fatal));
    let finish_sink = sink.clone();
    let worker = thread::spawn(move || {
        pw::init();
        let mainloop = pw::main_loop::MainLoopRc::new(None).map_err(pipewire_error)?;
        let command_loop = mainloop.clone();
        let attached = incoming.attach(mainloop.loop_(), move |command| match command {
            Command::Start { reply, .. } | Command::Pause { reply } => {
                let _ = reply.send(Ok(()));
            }
            Command::Stop => command_loop.quit(),
        });
        let _ = ready.send(());
        mainloop.run();
        drop(attached);
        let _ = finish_sink.send(SinkMessage::Finish);
        Ok(())
    });
    prepared.recv()?;
    Ok(PipewireSystemAudioRecording {
        commands: Some(commands),
        sink,
        worker: Some(worker),
        writer: Some(writer_thread),
        fatal,
        format,
        metrics: Arc::new(SystemAudioMetrics::default()),
        start_gate: gate,
        running: false,
    })
}

#[test]
fn audio_capture_rejects_zero_queue_before_connecting_to_pipewire()
-> Result<(), Box<dyn std::error::Error>> {
    let gate = Arc::new(StartGate::new());
    let error = PipewireSystemAudioRecording::open_inner(
        SystemAudioSelection::DefaultOutput,
        None,
        gate,
        0,
    )
    .err();
    assert!(matches!(error, Some(CaptureError::InvalidConfiguration(_))));
    Ok(())
}

#[test]
fn audio_capture_lifecycle_uses_local_pipewire_loop_and_finalizes_wav()
-> Result<(), Box<dyn std::error::Error>> {
    let temporary = tempfile::tempdir()?;
    let first = temporary.path().join("first.wav");
    let second = temporary.path().join("second.wav");
    let mut capture = lifecycle_fixture(&first)?;
    assert_eq!(
        capture.format(),
        SystemAudioFormat {
            sample_rate: 48_000,
            channels: 2
        }
    );
    assert_eq!(capture.metrics().samples_received(), 0);
    capture.start()?;
    assert!(capture.running);
    capture.pause()?;
    assert!(!capture.running);
    capture.pause()?;
    let resume_gate = Arc::new(StartGate::new());
    resume_gate.release(100)?;
    capture.resume(
        SystemAudioSegment {
            path: second.clone(),
            start_ns: 100,
        },
        resume_gate,
    )?;
    assert!(capture.running);
    capture.stop()?;
    assert!(!capture.running);
    assert!(capture.commands.is_none());
    assert_eq!(&std::fs::read(first)?[..4], b"RIFF");
    assert_eq!(&std::fs::read(second)?[..4], b"RIFF");
    capture.stop()?;
    assert!(capture.start().is_err());
    assert!(
        capture
            .resume(
                SystemAudioSegment {
                    path: temporary.path().join("late.wav"),
                    start_ns: 200
                },
                Arc::new(StartGate::new())
            )
            .is_err()
    );
    Ok(())
}

#[test]
fn audio_capture_resume_preserves_writer_failure_and_stops_cleanly()
-> Result<(), Box<dyn std::error::Error>> {
    let temporary = tempfile::tempdir()?;
    let first = temporary.path().join("first.wav");
    let mut capture = lifecycle_fixture(&first)?;
    capture.start()?;
    capture.pause()?;
    let gate = Arc::new(StartGate::new());
    gate.release(100)?;
    let error = capture
        .resume(
            SystemAudioSegment {
                path: temporary.path().to_path_buf(),
                start_ns: 100,
            },
            gate,
        )
        .err();
    assert!(error.is_some());
    assert!(!capture.running);
    capture.stop()?;
    Ok(())
}

fn serialized_pod(object: spa::pod::Object) -> Vec<u8> {
    spa::pod::serialize::PodSerializer::serialize(Cursor::new(Vec::new()), &Value::Object(object))
        .expect("test pod should serialize")
        .0
        .into_inner()
}

fn non_audio_format_pod() -> Vec<u8> {
    serialized_pod(spa::pod::object!(
        spa::utils::SpaTypes::ObjectParamFormat,
        ParamType::EnumFormat,
        spa::pod::property!(
            spa::param::format::FormatProperties::MediaType,
            Id,
            MediaType::Video
        ),
        spa::pod::property!(
            spa::param::format::FormatProperties::MediaSubtype,
            Id,
            MediaSubtype::Raw
        ),
    ))
}

fn valid_audio_format_pod() -> Vec<u8> {
    let mut info = spa::param::audio::AudioInfoRaw::new();
    info.set_format(spa::param::audio::AudioFormat::F32LE);
    info.set_rate(48_000);
    info.set_channels(2);
    serialized_pod(spa::pod::Object {
        type_: spa::utils::SpaTypes::ObjectParamFormat.as_raw(),
        id: ParamType::EnumFormat.as_raw(),
        properties: info.into(),
    })
}

fn format_pod(bytes: &[u8]) -> &Pod {
    Pod::from_bytes(bytes).expect("test bytes should contain a pod")
}

#[test]
fn ignores_a_pipewire_format_clear_during_system_audio_negotiation() {
    let bytes = valid_audio_format_pod();
    let pod = format_pod(&bytes);

    assert!(
        parse_audio_format_event(Some(pod))
            .expect("valid audio format should be accepted")
            .is_some()
    );
    assert!(
        parse_audio_format_event(None)
            .expect("PipeWire format clear is a renegotiation event")
            .is_none()
    );
    assert!(
        parse_audio_format_event(Some(pod))
            .expect("audio format after renegotiation should be accepted")
            .is_some()
    );
}

#[test]
fn rejects_an_invalid_some_audio_format_but_not_a_clear_event() {
    let bytes = non_audio_format_pod();
    let pod = format_pod(&bytes);

    assert!(parse_audio_format_event(Some(pod)).is_err());
    assert!(parse_audio_format_event(None).is_ok());
}

#[test]
fn peak_uses_the_loudest_absolute_finite_sample() {
    let bytes = [0.1_f32, -0.75, f32::NAN, 0.25]
        .into_iter()
        .flat_map(f32::to_le_bytes)
        .collect::<Vec<_>>();

    assert_eq!(peak_f32le(&bytes), 0.75);
}

#[test]
fn peak_clamps_overdriven_audio_and_ignores_partial_samples() {
    let mut bytes = 1.5_f32.to_le_bytes().to_vec();
    bytes.extend_from_slice(&[1, 2, 3]);

    assert_eq!(peak_f32le(&bytes), 1.0);
}

#[test]
fn peak_is_zero_for_silence_or_non_finite_samples() {
    let bytes = [0.0_f32, f32::INFINITY]
        .into_iter()
        .flat_map(f32::to_le_bytes)
        .collect::<Vec<_>>();

    assert_eq!(peak_f32le(&bytes), 0.0);
}

#[test]
fn dropping_audio_capture_stops_worker_and_publishes_wav_header()
-> Result<(), Box<dyn std::error::Error>> {
    let temporary = tempfile::tempdir()?;
    let path = temporary.path().join("dropped.wav");
    let mut capture = lifecycle_fixture(&path)?;
    capture.start()?;
    drop(capture);
    assert_eq!(&std::fs::read(path)?[..4], b"RIFF");
    Ok(())
}
