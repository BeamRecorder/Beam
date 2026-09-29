//! Independent QuickJS scenes for settings, region, countdown, and controls.

use std::{
    collections::HashMap,
    rc::Rc,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, Sender},
    },
    time::{Duration, Instant},
};

use argui_platform::WindowKey;
use argui_runtime::{NativeHostBatch, NativeHostDelivery};

use super::{
    RelayBatch, auxiliary_types::AuxiliaryStartup, relay::relay_batches, scene::NativeScene,
};
use crate::{
    QuickJsGallery,
    delivery::{coalesce_window_resizes, event_json},
    hot_reload::Dispatch,
    native_metrics::control_request,
    services::{ActorSession, ServiceRegistry, ServiceResponse},
};

/// Coordinates lazy creation with the first retained-tree commit.
#[derive(Default)]
pub(crate) struct WindowGate {
    pub opening: Mutex<()>,
    pub opened: AtomicBool,
    pub mounted: AtomicBool,
    pub failure: Mutex<Option<String>>,
}

/// Creates the fixed auxiliary Solid scenes without opening native windows yet.
pub(super) fn spawn_all(
    source: &str,
    contract_json: &'static str,
    gates: &HashMap<String, Arc<WindowGate>>,
    services: Arc<ServiceRegistry>,
    batches: Sender<NativeHostBatch>,
    stop: Arc<AtomicBool>,
) -> Result<Vec<(u32, Sender<NativeHostDelivery>)>, String> {
    let mut events = Vec::new();
    for (key, entry, generation) in [
        ("regionControls", "mountRegionControls", 100_000),
        ("regionActions", "mountRegionActions", 150_000),
        ("countdown", "mountCountdown", 200_000),
        ("recorder", "mountRecorder", 300_000),
        ("settings", "mountSettings", 400_000),
        ("windowPicker", "mountWindowPicker", 500_000),
        ("windowHighlight", "mountWindowHighlight", 600_000),
        ("teleprompter", "mountTeleprompter", 700_000),
    ] {
        let Some(gate) = gates.get(key) else {
            continue;
        };
        events.push((
            generation,
            spawn(
                source,
                contract_json,
                key,
                entry,
                generation,
                Arc::clone(&services),
                batches.clone(),
                Arc::clone(&stop),
                Arc::clone(gate),
            )?,
        ));
    }
    Ok(events)
}

/// Starts one Solid scene attached to `window`, returning its UI delivery channel.
/// The scene mounts on its first request and remains alive until shutdown.
#[allow(clippy::too_many_arguments)]
pub(super) fn spawn(
    source: &str,
    contract_json: &'static str,
    window: &'static str,
    entry: &'static str,
    generation: u32,
    services: Arc<ServiceRegistry>,
    batches: Sender<NativeHostBatch>,
    stop: Arc<AtomicBool>,
    gate: Arc<WindowGate>,
) -> Result<Sender<NativeHostDelivery>, String> {
    let (wire_sender, wire) = mpsc::channel::<RelayBatch>();
    let (errors_sender, errors) = mpsc::channel();
    std::thread::spawn(move || relay_batches(WindowKey::new(window), wire, batches, errors_sender));
    let (events_sender, events) = mpsc::channel::<NativeHostDelivery>();
    let (services_sender, responses) = mpsc::channel::<ServiceResponse>();
    services.register_session(generation, window, services_sender.clone());
    let source = source.to_owned();
    let startup = AuxiliaryStartup {
        source,
        contract_json,
        window,
        entry,
        generation,
        services,
        wire_sender,
        services_sender,
        gate,
    };
    std::thread::spawn(move || {
        let _session = ActorSession::new(Arc::clone(&startup.services), generation);
        if !wait_for_open(&startup.gate, &stop, &responses) {
            return;
        }
        let scene = match mount_scene(&startup) {
            Ok(scene) => scene,
            Err(error) => {
                fail_scene(&startup.gate, window, error);
                return;
            }
        };
        if let Err(error) = pump_scene(
            &scene.gallery,
            generation,
            &stop,
            &events,
            &responses,
            &errors,
        ) {
            fail_scene(&startup.gate, window, error);
        }
    });
    Ok(events_sender)
}

/// Waits without polling while discarding observations superseded by the initial snapshot.
fn wait_for_open(
    gate: &WindowGate,
    stop: &AtomicBool,
    responses: &Receiver<ServiceResponse>,
) -> bool {
    while !gate.opened.load(Ordering::Acquire) && !stop.load(Ordering::Acquire) {
        for _ in responses.try_iter() {}
        if gate.opened.load(Ordering::Acquire) || stop.load(Ordering::Acquire) {
            break;
        }
        std::thread::park();
    }
    !stop.load(Ordering::Acquire)
}

fn fail_scene(gate: &WindowGate, window: &str, error: String) {
    eprintln!("beam-{window}: {error}");
    *gate
        .failure
        .lock()
        .unwrap_or_else(|poison| poison.into_inner()) = Some(error);
}

fn mount_scene(startup: &AuxiliaryStartup) -> Result<NativeScene, String> {
    let generation = startup.generation;
    let route = Dispatch::new(
        generation,
        Arc::new(AtomicU64::new(0)),
        Arc::new(AtomicU64::new(0)),
    );
    let commit_route = Rc::clone(&route);
    let control_sender = startup.wire_sender.clone();
    let control_enabled = Arc::new(AtomicBool::new(false));
    let request_services = Arc::clone(&startup.services);
    let cancel_services = Arc::clone(&startup.services);
    let request_sender = startup.services_sender.clone();
    let scene = NativeScene {
        window: startup.window,
        gallery: QuickJsGallery::new_with_services(
            &startup.source,
            startup.contract_json,
            startup.entry,
            move |json| commit_route.borrow_mut().accept(&json),
            move |json| control_request(&json, &control_sender, &control_enabled),
            move |json| {
                request_services
                    .submit(generation, &json, request_sender.clone())
                    .err()
                    .unwrap_or_default()
            },
            move |json| {
                cancel_services
                    .cancel_json(generation, &json)
                    .err()
                    .unwrap_or_default()
            },
        )?,
    };
    if route.borrow().root.is_none() {
        return Err(format!("{} scene did not mount a root", startup.window));
    }
    let pending = std::mem::take(&mut route.borrow_mut().pending);
    commit_initial_scene(&startup.wire_sender, pending, startup.window)?;
    startup.gate.mounted.store(true, Ordering::Release);
    route.borrow_mut().activate(startup.wire_sender.clone());
    Ok(scene)
}

fn commit_initial_scene(
    wire: &Sender<RelayBatch>,
    pending: Vec<Vec<argui_runtime::WireOperation>>,
    window: &str,
) -> Result<(), String> {
    let final_index = pending
        .len()
        .checked_sub(1)
        .ok_or_else(|| format!("{window} scene has no initial commit"))?;
    let (acknowledge, completed) = mpsc::channel();
    for (index, operations) in pending.into_iter().enumerate() {
        wire.send(RelayBatch {
            operations,
            controls: Vec::new(),
            acknowledgement: (index == final_index).then(|| acknowledge.clone()),
        })
        .map_err(|_| "native UI channel closed".to_owned())?;
    }
    drop(acknowledge);
    completed
        .recv_timeout(Duration::from_secs(10))
        .map_err(|error| format!("{window} initial scene commit did not complete: {error}"))?
}

fn pump_scene(
    gallery: &QuickJsGallery,
    generation: u32,
    stop: &AtomicBool,
    events: &Receiver<NativeHostDelivery>,
    responses: &Receiver<ServiceResponse>,
    errors: &Receiver<String>,
) -> Result<(), String> {
    let started = Instant::now();
    while !stop.load(Ordering::Acquire) {
        if let Ok(error) = errors.try_recv() {
            return Err(error);
        }
        deliver_scene_services(gallery, generation, responses)?;
        deliver_scene_input(gallery, generation, events)?;
        gallery.tick(started.elapsed().as_secs_f64() * 1000.0)?;
        std::thread::park_timeout(gallery.next_wake(started.elapsed().as_secs_f64() * 1000.0)?);
    }
    Ok(())
}

fn deliver_scene_services(
    gallery: &QuickJsGallery,
    generation: u32,
    responses: &Receiver<ServiceResponse>,
) -> Result<(), String> {
    for response in coalesce_window_resizes(responses.try_iter().collect()) {
        if response.session == generation || response.session == u32::MAX {
            gallery.deliver_service(&response.json().to_string())?;
        }
    }
    Ok(())
}

fn deliver_scene_input(
    gallery: &QuickJsGallery,
    generation: u32,
    events: &Receiver<NativeHostDelivery>,
) -> Result<(), String> {
    for delivery in events.try_iter() {
        if delivery.callback.node.generation() == generation {
            gallery.deliver(&event_json(&delivery).to_string())?;
        }
    }
    Ok(())
}
