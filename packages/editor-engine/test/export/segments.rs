use beam_editor_engine::export::{
    segment_types::SegmentPolicy,
    segments,
    types::{Container, VideoEncoder},
};
use ges::prelude::*;
use std::sync::{Arc, atomic::AtomicBool};

pub(super) fn pcm(path: &std::path::Path) -> Vec<f32> {
    let pipeline=gst::parse::launch(&format!("filesrc location=\"{}\" ! matroskademux ! audio/x-vorbis ! vorbisdec ! audioconvert ! audioresample ! audio/x-raw,format=F32LE,rate=48000,channels=2,layout=interleaved ! appsink name=pcm sync=false",path.display())).unwrap().downcast::<gst::Pipeline>().unwrap();
    let sink = pipeline
        .by_name("pcm")
        .unwrap()
        .downcast::<gst_app::AppSink>()
        .unwrap();
    pipeline.set_state(gst::State::Playing).unwrap();
    let mut samples = Vec::new();
    while let Some(sample) = sink.try_pull_sample(gst::ClockTime::from_seconds(5)) {
        let buffer = sample.buffer().unwrap();
        let map = buffer.map_readable().unwrap();
        samples.extend(
            map.as_slice()
                .as_chunks::<4>()
                .0
                .iter()
                .map(|b| f32::from_le_bytes(*b)),
        );
    }
    let eos = sink.is_eos();
    let error = pipeline
        .bus()
        .unwrap()
        .pop_filtered(&[gst::MessageType::Error]);
    pipeline.set_state(gst::State::Null).unwrap();
    assert!(eos && error.is_none(), "audio decoder failed: {error:?}");
    samples
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "VA VP9 encoder and real OpenGL; no GUI"]
fn four_raw_windows_keep_real_video_frames_and_audio_continuous_in_one_file() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = crate::video::transitions::project(root.path(), media.path());
        project.canvas.width = 128;
        project.canvas.height = 96;
        let encoder = VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc");
        let output = media.path().join("segmented.webm");
        let report = segments::render_with_policy(
            root.path(),
            &project,
            &output,
            Container::Webm,
            encoder,
            Arc::new(AtomicBool::new(false)),
            |_| {},
            SegmentPolicy {
                window_ms: 500,
                ..Default::default()
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            (report.segments, report.video_frames, report.audio_samples),
            (4, 60, 96_000)
        );
        assert_eq!(report.peak_native_clips, 2);
        let ffprobe = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_streams",
                "-show_packets",
                "-of",
                "json",
            ])
            .arg(&output)
            .output()
            .unwrap();
        assert!(ffprobe.status.success());
        let json: serde_json::Value = serde_json::from_slice(&ffprobe.stdout).unwrap();
        let streams = json["streams"].as_array().unwrap();
        let video = streams.iter().find(|s| s["codec_type"] == "video").unwrap();
        assert_eq!(video["codec_name"], "vp9");
        assert_eq!(video["width"], 128);
        assert_eq!(video["height"], 96);
        let packets: Vec<_> = json["packets"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|p| p["codec_type"] == "video")
            .collect();
        assert_eq!(packets.len(), 60);
        for pair in packets.windows(2) {
            let first = pair[0]["pts_time"]
                .as_str()
                .unwrap()
                .parse::<f64>()
                .unwrap();
            let second = pair[1]["pts_time"]
                .as_str()
                .unwrap()
                .parse::<f64>()
                .unwrap();
            assert!(
                (second - first - 1. / 30.).abs() < 0.0011,
                "continuous video clock: {first}->{second}"
            );
        }
        let whole = media.path().join("whole.webm");
        assert!(
            segments::render(
                root.path(),
                &project,
                &whole,
                Container::Webm,
                encoder,
                Arc::new(AtomicBool::new(false)),
                |_| {}
            )
            .unwrap()
        );
        let actual = pcm(&output);
        let reference = pcm(&whole);
        assert_eq!(actual.len(), reference.len());
        assert!(actual.len() >= 96_000 * 2);
        let maximum = actual
            .iter()
            .zip(&reference)
            .map(|(a, b)| (a - b).abs())
            .fold(0_f32, f32::max);
        assert!(
            maximum < 0.015,
            "one continuing audio encoder preserves samples across source windows: max difference {maximum}"
        );
        for boundary in [24_000, 48_000, 72_000] {
            let range = boundary * 2 - 128..boundary * 2 + 128;
            let rms = (actual[range].iter().map(|x| x * x).sum::<f32>() / 256.).sqrt();
            assert!(rms > 0.1, "no invented silence at sample {boundary}");
        }
    });
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "VA VP9 encoder and real OpenGL; no GUI"]
fn transition_boundaries_between_frames_keep_every_global_composition_frame() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = crate::video::transitions::project(root.path(), media.path());
        project.canvas.width = 128;
        project.canvas.height = 96;
        project.transitions[0].duration_ms = 300;
        let report = segments::render_with_policy(
            root.path(),
            &project,
            &media.path().join("between-frames.webm"),
            Container::Webm,
            VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc"),
            Arc::new(AtomicBool::new(false)),
            |_| {},
            SegmentPolicy {
                window_ms: 500,
                ..Default::default()
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!((report.video_frames, report.audio_samples), (60, 96_000));
    });
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "VA VP9 encoder and real OpenGL; no GUI"]
fn cancellation_releases_a_live_raw_handoff_without_finishing_the_export() {
    use std::sync::atomic::Ordering;
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = crate::video::transitions::project(root.path(), media.path());
        project.canvas.width = 128;
        project.canvas.height = 96;
        let cancel = Arc::new(AtomicBool::new(false));
        let signal = cancel.clone();
        let output = media.path().join("cancelled.webm");
        let result = segments::render_with_policy(
            root.path(),
            &project,
            &output,
            Container::Webm,
            VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc"),
            cancel.clone(),
            move |position| {
                if position >= 100 {
                    signal.store(true, Ordering::Release);
                }
            },
            SegmentPolicy {
                window_ms: 500,
                ..Default::default()
            },
        )
        .unwrap();
        assert!(
            cancel.load(Ordering::Acquire),
            "the real encoder must have started"
        );
        assert!(
            result.is_none(),
            "cancelled windows cannot publish a completed report"
        );
    });
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "VA VP9 encoder and real OpenGL; no GUI"]
fn an_encoder_output_failure_stops_the_source_window_and_returns_an_error() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let mut project = crate::video::transitions::project(root.path(), media.path());
        project.canvas.width = 128;
        project.canvas.height = 96;
        let result = segments::render(
            root.path(),
            &project,
            media.path(),
            Container::Webm,
            VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc"),
            Arc::new(AtomicBool::new(false)),
            |_| {},
        );
        assert!(result.is_err(), "a directory cannot become an encoded file");
    });
}

#[cfg(target_os = "linux")]
fn short_clips(
    root: &std::path::Path,
    media: &std::path::Path,
    count: u64,
) -> beam_editor_engine::Project {
    let mut project = crate::video::transitions::project(root, media);
    project.canvas.width = 128;
    project.canvas.height = 96;
    project.transitions.clear();
    project.assets.truncate(1);
    let template = crate::video::clip(&project, 0);
    project.clips = Default::default();
    for index in 0..count {
        let mut clip = (*template).clone();
        clip.id = uuid::Uuid::new_v4();
        clip.start_ms = index * 20;
        clip.source_in_ms = 500 + index % 100 * 20;
        clip.duration_ms = 20;
        project.clips.try_push(clip).unwrap();
    }
    project
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "VA VP9 encoder and real OpenGL; no GUI"]
fn short_source_cuts_preserve_global_video_and_audio_through_adaptive_windows() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let project = short_clips(root.path(), media.path(), 100);
        let report = segments::render_with_policy(
            root.path(),
            &project,
            &media.path().join("short.webm"),
            Container::Webm,
            VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc"),
            Arc::new(AtomicBool::new(false)),
            |_| {},
            SegmentPolicy {
                target_native_clips: 10,
                ..Default::default()
            },
        )
        .unwrap()
        .unwrap();
        assert!(report.segments > 1);
        assert!(report.peak_native_clips <= 10);
        assert_eq!((report.video_frames, report.audio_samples), (60, 96_000));
    });
}

#[cfg(target_os = "linux")]
fn rss() -> u64 {
    std::fs::read_to_string("/proc/self/status")
        .unwrap()
        .lines()
        .find_map(|line| {
            line.strip_prefix("VmRSS:").map(|value| {
                value
                    .split_whitespace()
                    .next()
                    .unwrap()
                    .parse::<u64>()
                    .unwrap()
                    * 1024
            })
        })
        .unwrap()
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "200-second real-media growth benchmark; VA VP9 and OpenGL"]
fn ten_thousand_short_clips_export_all_frames_and_pcm_with_bounded_source_graphs() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let project = short_clips(root.path(), media.path(), 10_000);
        let output = media.path().join("ten-thousand.webm");
        let baseline = rss();
        let start = std::time::Instant::now();
        let mut memory = Vec::new();
        let report = segments::render_with_policy(
            root.path(),
            &project,
            &output,
            Container::Webm,
            VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc"),
            Arc::new(AtomicBool::new(false)),
            |position| {
                let bytes = rss();
                if memory
                    .last()
                    .is_none_or(|&(last, _)| position / 10_000 > last / 10_000)
                {
                    memory.push((position, bytes));
                    eprintln!(
                        "export-growth progress={position}ms rss={bytes} elapsed={}ms",
                        start.elapsed().as_millis()
                    );
                }
            },
            SegmentPolicy::default(),
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            (report.video_frames, report.audio_samples),
            (6000, 9_600_000)
        );
        assert!(report.peak_native_clips <= 128);
        assert_eq!(project.clips.len(), 10_000);
        let peak = memory.iter().map(|&(_, bytes)| bytes).max().unwrap();
        eprintln!(
            "export-growth complete segments={} frames={} audioSamples={} peakNativeClips={} baselineRss={baseline} sampledPeakRss={peak} elapsedMs={}",
            report.segments,
            report.video_frames,
            report.audio_samples,
            report.peak_native_clips,
            start.elapsed().as_millis()
        );
        let probe = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-count_packets",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
            ])
            .arg(&output)
            .output()
            .unwrap();
        assert!(probe.status.success());
        let data: serde_json::Value = serde_json::from_slice(&probe.stdout).unwrap();
        let streams = data["streams"].as_array().unwrap();
        let video = streams.iter().find(|s| s["codec_type"] == "video").unwrap();
        let audio = streams.iter().find(|s| s["codec_type"] == "audio").unwrap();
        assert_eq!(video["nb_read_packets"], "6000");
        assert_eq!(video["r_frame_rate"], "30/1");
        assert_eq!(audio["sample_rate"], "48000");
        let duration = data["format"]["duration"]
            .as_str()
            .unwrap()
            .parse::<f64>()
            .unwrap();
        assert!(
            (duration - 200.).abs() <= 1. / 30.,
            "codec tail stays within one frame: {duration}"
        );
    });
}
