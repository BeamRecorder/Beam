use std::{
    error::Error,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use beam_camera::CameraRequest;
use beam_media_session::{
    AudioSelection, CameraSelection, MediaSession, ProbeLoopMeasurements, SessionConfig,
};

use crate::args::RecordArgs;
use crate::preview::PreviewWorker;
use crate::resources::ProcessSampler;

pub fn run(args: RecordArgs) -> Result<(), Box<dyn Error>> {
    let camera = if args.no_camera {
        CameraSelection::Disabled
    } else if let Some(id) = args.camera {
        CameraSelection::Device(CameraRequest {
            device_id: id,
            width: 1280,
            height: 720,
            fps: 30,
        })
    } else {
        CameraSelection::FirstAvailable {
            width: 1280,
            height: 720,
            fps: 30,
        }
    };
    let config = SessionConfig {
        screen: None,
        output_dir: args.output.clone(),
        camera,
        microphone: select_audio(args.no_microphone, args.microphone),
        system_audio: select_audio(args.no_system_audio, args.system_output),
    };
    let interrupted = Arc::new(AtomicBool::new(false));
    let signal_flag = interrupted.clone();
    ctrlc::set_handler(move || signal_flag.store(true, Ordering::Release))?;
    let mut resources = ProcessSampler::new()?;
    let mut session = MediaSession::prepare(config)?;
    let mut preview_error = None;
    let gpu = if session.camera_preview_source().is_some() {
        match initialize_gpu() {
            Ok(pair) => Some(pair),
            Err(error) => {
                let reason = format!("failed to initialize camera preview: {error}");
                session.set_preview_error(reason.clone());
                preview_error = Some(reason);
                None
            }
        }
    } else {
        None
    };
    if let Err(error) = session.start() {
        let reason = format!("failed to start session: {error}");
        return match session.interrupt(&reason) {
            Ok(_) => Err(Box::new(error)),
            Err(finalize_error) => {
                Err(format!("{error}; finalization failed: {finalize_error}").into())
            }
        };
    }
    let preview_worker = match (gpu, session.camera_preview_source()) {
        (Some((device, queue)), Some(source)) => {
            match PreviewWorker::start(
                device,
                queue,
                source,
                session.timeline(),
                Duration::from_millis(args.preview_delay_ms),
            ) {
                Ok(worker) => Some(worker),
                Err(error) => {
                    let reason = format!("failed to start camera preview: {error}");
                    session.set_preview_error(reason.clone());
                    preview_error = Some(reason);
                    None
                }
            }
        }
        _ => None,
    };
    let end = match Instant::now().checked_add(Duration::from_secs(args.duration_seconds)) {
        Some(end) => end,
        None => {
            let reason = "recording duration is too long";
            session.interrupt(reason)?;
            return Err(reason.into());
        }
    };
    let mut polling_error = None;
    let mut probe_loop = ProbeLoopMeasurements::default();
    while Instant::now() < end && !interrupted.load(Ordering::Acquire) {
        let poll_started = Instant::now();
        let poll_result = session.poll();
        probe_loop.record_poll(duration_ns(poll_started.elapsed()));
        if let Err(error) = poll_result {
            polling_error = Some(error);
            break;
        }
        if let Some(session_ns) = session.session_ns() {
            let sample_started = Instant::now();
            let sample = resources.sample(
                session_ns,
                preview_worker
                    .as_ref()
                    .and_then(PreviewWorker::gpu_memory_bytes),
                preview_worker.as_ref().map(PreviewWorker::frames_uploaded),
            );
            if let Some(mut sample) = sample {
                probe_loop.record_resource_sample(duration_ns(sample_started.elapsed()));
                sample.session_ns = session.session_ns().unwrap_or(session_ns);
                session.record_process_sample(sample);
            }
        }
        thread::sleep(Duration::from_millis(10));
    }
    session.set_probe_loop_measurements(probe_loop);
    if let Some(worker) = preview_worker {
        match worker.stop() {
            Ok(outcome) => {
                session.set_preview_measurements(outcome.measurements);
                if let Some(error) = outcome.error {
                    session.set_preview_error(error.clone());
                    preview_error = Some(error);
                }
            }
            Err(error) => {
                session.set_preview_error(error.clone());
                preview_error = Some(error);
            }
        }
    }
    if let Some(error) = polling_error {
        let reason = format!("session polling failed: {error}");
        return match session.interrupt(&reason) {
            Ok(_) => Err(Box::new(error)),
            Err(finalize_error) => {
                Err(format!("{error}; finalization failed: {finalize_error}").into())
            }
        };
    }
    let manifest = if interrupted.load(Ordering::Acquire) {
        session.interrupt("recording interrupted by user")?
    } else {
        session.stop()?
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "manifest": args.output.join("manifest.json"),
            "measurements": args.output.join("measurements.json"),
            "completed": manifest.completed,
            "tracks": manifest.tracks.iter().map(|track| serde_json::json!({
                "kind": format!("{:?}", track.kind),
                "status": format!("{:?}", track.status),
                "reason": track.termination_reason,
            })).collect::<Vec<_>>(),
        }))?
    );
    if !manifest.completed {
        return Err("one or more requested tracks did not complete; inspect manifest.json".into());
    }
    if let Some(error) = preview_error {
        return Err(format!("camera preview failed: {error}").into());
    }
    Ok(())
}

fn initialize_gpu() -> Result<(wgpu::Device, wgpu::Queue), Box<dyn Error>> {
    let instance = wgpu::Instance::default();
    let adapter =
        pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))?;
    Ok(pollster::block_on(
        adapter.request_device(&wgpu::DeviceDescriptor::default()),
    )?)
}

fn select_audio(disabled: bool, id: Option<String>) -> AudioSelection {
    if disabled {
        AudioSelection::Disabled
    } else if let Some(id) = id {
        AudioSelection::Device(id)
    } else {
        AudioSelection::Default
    }
}

fn duration_ns(duration: Duration) -> u64 {
    duration.as_nanos().min(u128::from(u64::MAX)) as u64
}
