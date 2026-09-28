//! Independent QuickJS scenes for settings, region, countdown, and controls.

use std::{
    collections::HashMap,
    rc::Rc,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Sender},
    },
    time::{Duration, Instant},
};

use argui_platform::WindowKey;
use argui_runtime::{NativeHostBatch, NativeHostDelivery};

use super::{RelayBatch, relay::relay_batches};
use crate::{
    QuickJsGallery,
    delivery::event_json,
    hot_reload::Dispatch,
    native_metrics::control_request,
    services::{ServiceRegistry, ServiceResponse},
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
        ("regionActions", "mountRegionActions", 800_000),
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
    std::thread::spawn(move || {
        services.register_actor(generation);
        while !gate.opened.load(Ordering::Acquire) && !stop.load(Ordering::Acquire) {
            // Initial state is read at mount; discard obsolete pre-mount events.
            for _ in responses.try_iter() {}
            if gate.opened.load(Ordering::Acquire) || stop.load(Ordering::Acquire) {
                break;
            }
            std::thread::park();
        }
        if stop.load(Ordering::Acquire) {
            return;
        }
        let route = Dispatch::new(
            generation,
            Arc::new(AtomicU64::new(0)),
            Arc::new(AtomicU64::new(0)),
        );
        let commit_route = Rc::clone(&route);
        let control_sender = wire_sender.clone();
        let control_enabled = Arc::new(AtomicBool::new(false));
        let request_services = Arc::clone(&services);
        let cancel_services = Arc::clone(&services);
        let request_sender = services_sender.clone();
        let gallery = QuickJsGallery::new_with_services(
            &source,
            contract_json,
            entry,
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
        );
        let gallery = match gallery {
            Ok(gallery) => gallery,
            Err(error) => {
                *gate
                    .failure
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner()) = Some(error);
                return;
            }
        };
        if route.borrow().root.is_none() {
            *gate
                .failure
                .lock()
                .unwrap_or_else(|poison| poison.into_inner()) =
                Some(format!("{window} scene did not mount a root"));
            return;
        }
        let pending = std::mem::take(&mut route.borrow_mut().pending);
        let final_index = pending.len().saturating_sub(1);
        let (acknowledge, completed) = mpsc::channel();
        for (index, operations) in pending.into_iter().enumerate() {
            if wire_sender
                .send(RelayBatch {
                    operations,
                    controls: Vec::new(),
                    acknowledgement: (index == final_index).then(|| acknowledge.clone()),
                })
                .is_err()
            {
                eprintln!("beam-{window}: native UI channel closed");
                return;
            }
        }
        match completed.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(())) => gate.mounted.store(true, Ordering::Release),
            Ok(Err(error)) => {
                eprintln!("beam-{window}: {error}");
                *gate
                    .failure
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner()) = Some(error);
                return;
            }
            Err(_) => {
                let error = format!("{window} initial scene commit timed out");
                eprintln!("beam-{window}: {error}");
                *gate
                    .failure
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner()) = Some(error);
                return;
            }
        }
        route.borrow_mut().activate(wire_sender);
        let started = Instant::now();
        while !stop.load(Ordering::Acquire) {
            if let Ok(error) = errors.try_recv() {
                eprintln!("beam-{window}: {error}");
                break;
            }
            for response in responses.try_iter() {
                if (response.session == generation || response.session == u32::MAX)
                    && let Err(error) = gallery.deliver_service(&response.json().to_string())
                {
                    eprintln!("beam-{window}: {error}");
                    return;
                }
            }
            let incoming = events.try_iter();
            for delivery in incoming {
                if delivery.callback.node.generation() != generation {
                    continue;
                }
                if let Err(error) = gallery.deliver(&event_json(&delivery).to_string()) {
                    eprintln!("beam-{window}: {error}");
                    return;
                }
            }
            if let Err(error) = gallery.tick(started.elapsed().as_secs_f64() * 1000.0) {
                eprintln!("beam-{window}: {error}");
                break;
            }
            match gallery.next_wake(started.elapsed().as_secs_f64() * 1000.0) {
                Ok(delay) => std::thread::park_timeout(delay),
                Err(error) => {
                    eprintln!("beam-{window}: {error}");
                    break;
                }
            }
        }
        if let Err(error) = gallery.dispose() {
            eprintln!("beam-{window}: {error}");
        }
        services.cancel_session(generation);
    });
    Ok(events_sender)
}
