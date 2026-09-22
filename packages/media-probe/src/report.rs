use std::{error::Error, fs};

use beam_media_manifest::SessionManifest;
use beam_media_session::SessionMeasurements;

use crate::args::ReportArgs;

pub fn run(args: ReportArgs) -> Result<(), Box<dyn Error>> {
    let manifest: SessionManifest =
        serde_json::from_slice(&fs::read(args.output.join("manifest.json"))?)?;
    let measurements: SessionMeasurements =
        serde_json::from_slice(&fs::read(args.output.join("measurements.json"))?)?;
    let tracks = manifest
        .tracks
        .iter()
        .map(|track| {
            let queue_peaks = match track.kind {
                beam_media_manifest::TrackKind::Camera => Some(measurements.camera.queue_peaks),
                beam_media_manifest::TrackKind::Microphone => {
                    Some(measurements.microphone.queue_peaks)
                }
                beam_media_manifest::TrackKind::SystemAudio => {
                    Some(measurements.system_audio.queue_peaks)
                }
                _ => None,
            };
            let files = track
                .segments
                .iter()
                .map(|segment| {
                    serde_json::json!({
                        "path": segment.path,
                        "exists": args.output.join(&segment.path).is_file(),
                        "complete": segment.complete,
                    })
                })
                .collect::<Vec<_>>();
            serde_json::json!({
                "kind": format!("{:?}", track.kind),
                "status": format!("{:?}", track.status),
                "reason": track.termination_reason,
                "files": files,
                "framesAcquired": track.metrics.frames_acquired,
                "framesEncoded": track.metrics.frames_encoded,
                "framesDropped": track.metrics.frames_dropped,
                "samplesReceived": track.metrics.samples_received,
                "samplesDropped": track.metrics.samples_dropped,
                "queuePeaks": queue_peaks,
            })
        })
        .collect::<Vec<_>>();
    let peak_rss_bytes = measurements
        .process_samples
        .iter()
        .map(|sample| sample.rss_bytes)
        .max();
    let peak_cpu_percent_x100 = measurements
        .process_samples
        .iter()
        .map(|sample| sample.cpu_percent_x100)
        .max();
    let peak_gpu_memory_bytes = measurements
        .process_samples
        .iter()
        .filter_map(|sample| sample.gpu_memory_bytes)
        .max();
    let camera_fps = manifest
        .tracks
        .iter()
        .find(|track| track.kind == beam_media_manifest::TrackKind::Camera)
        .and_then(|track| rate_per_second(track.metrics.frames_encoded, manifest.duration_ns));
    let preview_fps = measurements
        .preview
        .and_then(|preview| rate_per_second(preview.frames_uploaded, manifest.duration_ns));
    let preview_submission_latency_mean_ns = measurements
        .preview
        .and_then(|preview| preview.mean_submission_latency_ns());
    let preview_submission_latency_max_ns = measurements.preview.and_then(|preview| {
        (preview.submission_latency_samples > 0).then_some(preview.submission_latency_max_ns)
    });
    let preview_cpu_buffer_growth_per_frame_bytes = measurements.preview.and_then(|preview| {
        bytes_per_frame(preview.cpu_buffer_growth_bytes, preview.frames_uploaded)
    });
    let preview_cpu_color_conversion_bytes_per_frame = measurements.preview.and_then(|preview| {
        bytes_per_frame(preview.cpu_color_conversion_bytes, preview.frames_uploaded)
    });
    let preview_cpu_padding_copy_bytes_per_frame = measurements.preview.and_then(|preview| {
        bytes_per_frame(preview.cpu_padding_copy_bytes, preview.frames_uploaded)
    });
    let preview_gpu_upload_bytes_per_frame = measurements
        .preview
        .and_then(|preview| bytes_per_frame(preview.bytes_uploaded, preview.frames_uploaded));
    let camera_acquired_fps = manifest
        .tracks
        .iter()
        .find(|track| track.kind == beam_media_manifest::TrackKind::Camera)
        .and_then(|track| rate_per_second(track.metrics.frames_acquired, manifest.duration_ns));
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "completed": manifest.completed,
            "durationNs": manifest.duration_ns,
            "initialAvOffsetNs": measurements.initial_av_offset_ns,
            "cameraDriftPpm": measurements.camera.drift_ppm(),
            "microphoneDriftPpm": measurements.microphone.drift_ppm(),
            "systemAudioDriftPpm": measurements.system_audio.drift_ppm(),
            "cameraNativeClockDiscontinuous": measurements.camera.has_native_clock_discontinuity(),
            "microphoneNativeClockDiscontinuous": measurements.microphone.has_native_clock_discontinuity(),
            "systemAudioNativeClockDiscontinuous": measurements.system_audio.has_native_clock_discontinuity(),
            "preview": measurements.preview,
            "previewError": measurements.preview_error,
            "cameraEncodedFps": camera_fps,
            "cameraAcquiredFps": camera_acquired_fps,
            "previewFps": preview_fps,
            "previewSubmissionLatencyMeanNs": preview_submission_latency_mean_ns,
            "previewSubmissionLatencyMaxNs": preview_submission_latency_max_ns,
            "previewCpuBufferGrowthPerFrameBytes": preview_cpu_buffer_growth_per_frame_bytes,
            "previewCpuColorConversionBytesPerFrame": preview_cpu_color_conversion_bytes_per_frame,
            "previewCpuPaddingCopyBytesPerFrame": preview_cpu_padding_copy_bytes_per_frame,
            "previewGpuUploadBytesPerFrame": preview_gpu_upload_bytes_per_frame,
            "processSampleCount": measurements.process_samples.len(),
            "probeLoop": measurements.probe_loop,
            "peakRssBytes": peak_rss_bytes,
            "peakCpuPercentX100": peak_cpu_percent_x100,
            "peakGpuMemoryBytes": peak_gpu_memory_bytes,
            "tracks": tracks,
        }))?
    );
    Ok(())
}

fn rate_per_second(count: u64, duration_ns: u64) -> Option<f64> {
    (duration_ns > 0).then_some(count as f64 * 1_000_000_000.0 / duration_ns as f64)
}

fn bytes_per_frame(bytes: u64, frames: u64) -> Option<f64> {
    (frames > 0).then_some(bytes as f64 / frames as f64)
}
