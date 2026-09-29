use beam_editor_engine::{
    EditorController,
    video::visuals::types::{Visual, VisualRequest},
};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
    mpsc,
};
use std::time::{Duration, Instant};
#[test]
fn source_worker_extracts_actual_audio_and_sparse_frames_without_delaying_transport() {
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Visuals".into())
        .unwrap();
    let snapshot = controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "audio.webm",
            true,
        )])
        .unwrap();
    let id = snapshot.project.assets[0].id.to_string();
    let source = controller.source(id).unwrap();
    assert!(source.asset.cursor.is_empty());
    controller.seek(500).unwrap();
    let (sender, receiver) = mpsc::channel();
    controller
        .source_visual(
            source.clone(),
            VisualRequest::Audio {
                start_ms: 200,
                end_ms: 800,
                step_ms: 10,
            },
            Arc::new(AtomicBool::new(false)),
            Box::new(move |update| {
                sender.send(update).unwrap();
            }),
        )
        .unwrap();
    let began = Instant::now();
    assert_eq!(controller.transport().unwrap().position_ms, 500);
    assert!(began.elapsed() < Duration::from_millis(100));
    let update = receiver
        .recv_timeout(Duration::from_secs(15))
        .unwrap()
        .unwrap();
    assert!(update.complete);
    let Visual::Audio(data) = update.visual else {
        panic!("waveform")
    };
    assert_eq!(data.points.len(), 60);
    assert!(data.ready.iter().all(|ready| *ready));
    assert!(data.points.iter().any(|p| p[0] > 0.1));
    assert!(data.points.iter().any(|p| p[1..].iter().any(|a| *a > 0.01)));
    let (sender, receiver) = mpsc::channel();
    controller
        .source_visual(
            source,
            VisualRequest::Video { position_ms: 700 },
            Arc::new(AtomicBool::new(false)),
            Box::new(move |update| {
                sender.send(update).unwrap();
            }),
        )
        .unwrap();
    let Visual::Video(frame) = receiver
        .recv_timeout(Duration::from_secs(15))
        .unwrap()
        .unwrap()
        .visual
    else {
        panic!("frame")
    };
    assert_eq!(frame.width, 256);
    assert_eq!(controller.transport().unwrap().position_ms, 500);
}
#[test]
fn cancelled_requests_do_not_publish_and_missing_files_report_failure() {
    let worker = beam_editor_engine::video::visuals::worker::VisualWorker::new().unwrap();
    let source = super::source();
    let cancelled = Arc::new(AtomicBool::new(true));
    let (sender, receiver) = mpsc::channel();
    worker
        .submit(
            source.clone(),
            VisualRequest::Video { position_ms: 0 },
            cancelled.clone(),
            Box::new(move |result| {
                sender.send(result).unwrap();
            }),
        )
        .unwrap();
    assert!(receiver.recv_timeout(Duration::from_millis(150)).is_err());
    assert!(cancelled.load(Ordering::Acquire));
    let (sender, receiver) = mpsc::channel();
    worker
        .submit(
            source,
            VisualRequest::Audio {
                start_ms: 0,
                end_ms: 100,
                step_ms: 10,
            },
            Arc::new(AtomicBool::new(false)),
            Box::new(move |result| {
                sender.send(result).unwrap();
            }),
        )
        .unwrap();
    assert!(
        receiver
            .recv_timeout(Duration::from_secs(10))
            .unwrap()
            .is_err()
    );
}

#[test]
fn streamed_chunks_complete_bins_crossing_eight_seconds_and_reuse_finer_coverage() {
    use gst::prelude::*;
    let root = tempfile::tempdir().unwrap();
    gst::init().unwrap();
    let path = root.path().join("source.wav");
    let pipeline = gst::parse::launch(&format!("audiotestsrc num-buffers=900 samplesperbuffer=480 ! audio/x-raw,rate=48000 ! wavenc ! filesink location=\"{}\"",path.display())).unwrap();
    pipeline.set_state(gst::State::Playing).unwrap();
    let message = pipeline
        .bus()
        .unwrap()
        .timed_pop_filtered(
            gst::ClockTime::from_seconds(10),
            &[gst::MessageType::Eos, gst::MessageType::Error],
        )
        .unwrap();
    pipeline.set_state(gst::State::Null).unwrap();
    assert!(matches!(message.view(), gst::MessageView::Eos(..)));
    let mut source = super::source();
    source.root = root.path().into();
    source.asset.path = "source.wav".into();
    source.asset.duration_ms = 9000;
    source.asset.has_video = false;
    let worker = beam_editor_engine::video::visuals::VisualWorker::new().unwrap();
    let (sender, receiver) = mpsc::channel();
    worker
        .submit(
            source.clone(),
            VisualRequest::Audio {
                start_ms: 0,
                end_ms: 9000,
                step_ms: 256,
            },
            Arc::new(AtomicBool::new(false)),
            Box::new(move |update| {
                sender.send(update).unwrap();
            }),
        )
        .unwrap();
    let first = receiver
        .recv_timeout(Duration::from_secs(15))
        .unwrap()
        .unwrap();
    assert!(!first.complete);
    let last = receiver
        .recv_timeout(Duration::from_secs(15))
        .unwrap()
        .unwrap();
    assert!(last.complete);
    let Visual::Audio(data) = last.visual else {
        panic!("audio")
    };
    assert!(data.ready.iter().all(|ready| *ready));
    assert_eq!(data.points.len(), 36);
    // A fully cached lower-detail request requires neither the file nor a decoder.
    std::fs::remove_file(path).unwrap();
    let (sender, receiver) = mpsc::channel();
    worker
        .submit(
            source,
            VisualRequest::Audio {
                start_ms: 0,
                end_ms: 9000,
                step_ms: 512,
            },
            Arc::new(AtomicBool::new(false)),
            Box::new(move |update| {
                sender.send(update).unwrap();
            }),
        )
        .unwrap();
    let reused = receiver
        .recv_timeout(Duration::from_secs(2))
        .unwrap()
        .unwrap();
    assert!(reused.complete);
    let Visual::Audio(data) = reused.visual else {
        panic!("audio")
    };
    assert!(data.ready.iter().all(|ready| *ready));
    assert_eq!(data.points.len(), 18);
}
