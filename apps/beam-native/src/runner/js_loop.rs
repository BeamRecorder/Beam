//! Event pump for the embedded QuickJS actor.

use std::{
    cell::RefCell,
    rc::Rc,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{Receiver, Sender},
    },
    time::{Duration, Instant},
};

use super::RelayBatch;
use crate::{
    QuickJsGallery,
    delivery::{coalesce_virtual_windows, event_json},
    hot_reload::{BundleWatcher, Dispatch, ReloadContext, reload_gallery},
    services::{ServiceChannels, ServiceResponse},
    telemetry::JsCounts,
};
use argui_runtime::NativeHostDelivery;
#[cfg(any(debug_assertions, feature = "dev-metrics"))]
use argui_ui::UiEventKind;

/// Development bundle state owned by the QuickJS actor.
pub(super) struct ReloadControl<'a> {
    pub(super) watcher: Option<BundleWatcher>,
    pub(super) contract_json: &'a str,
    pub(super) sender: &'a Sender<RelayBatch>,
}

/// Native channels consumed by the QuickJS event pump.
pub(super) struct JsLoopInbox {
    pub(super) events: Receiver<NativeHostDelivery>,
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    pub(super) profiles: Receiver<String>,
    pub(super) errors: Receiver<String>,
    pub(super) stop: Receiver<()>,
    pub(super) services: Receiver<ServiceResponse>,
}

/// Pumps native events, timer callbacks, and QuickJS microtasks until shutdown.
/// `gallery` is the active script; `dispatch` routes commits; `reload` watches
/// candidate bundles; `inbox` carries native events and shutdown; `profile_enabled`
/// gates profiling samples, and `counts` records JavaScript work. Returns after
/// shutdown or on the first unrecoverable JavaScript/native commit error.
///
/// # Errors
/// Returns an error when JavaScript fails or the native host rejects a batch.
pub(super) fn run_js_loop(
    gallery: &mut QuickJsGallery,
    dispatch: &mut Rc<RefCell<Dispatch>>,
    reload: &mut ReloadControl<'_>,
    inbox: JsLoopInbox,
    profile_enabled: &Arc<AtomicBool>,
    counts: &JsCounts,
    services: ServiceChannels<'_>,
) -> Result<(), String> {
    let started = Instant::now();
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    let mut work = Duration::ZERO;
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    let mut ticks = 0_u64;
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    let mut deliveries = 0_u64;
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    let mut window_deliveries = 0_u64;
    #[cfg(not(any(debug_assertions, feature = "dev-metrics")))]
    let _ = counts;
    loop {
        if inbox.stop.try_recv().is_ok() {
            break;
        }
        if let Ok(error) = inbox.errors.try_recv() {
            return Err(format!("native commit rejected: {error}"));
        }
        if let Some(watcher) = reload.watcher.as_mut() {
            match watcher.changed() {
                Ok(Some(source)) => {
                    if let Err(error) = reload_gallery(
                        gallery,
                        dispatch,
                        &source,
                        reload.contract_json,
                        ReloadContext {
                            sender: reload.sender,
                            counts,
                            profile_enabled,
                            services: ServiceChannels {
                                registry: services.registry,
                                sender: services.sender,
                            },
                        },
                    ) {
                        eprintln!("argui-hot-reload: {error}; keeping previous scene");
                    } else {
                        services
                            .registry
                            .register_actor(dispatch.borrow().generation);
                        services.registry.register_session(
                            dispatch.borrow().generation,
                            "main",
                            services.sender.clone(),
                        );
                        eprintln!("argui-hot-reload: bundle applied");
                    }
                }
                Ok(None) => {}
                Err(error) => eprintln!("argui-hot-reload: {error}"),
            }
        }
        let generation = dispatch.borrow().generation;
        deliver_services(gallery, &inbox.services, generation, services.registry)?;
        let burst = inbox.events.try_iter().collect();
        for delivery in coalesce_virtual_windows(burst) {
            if delivery.callback.node.generation() != dispatch.borrow().generation {
                continue;
            }
            #[cfg(any(debug_assertions, feature = "dev-metrics"))]
            let entered = Instant::now();
            gallery.deliver(&event_json(&delivery).to_string())?;
            #[cfg(any(debug_assertions, feature = "dev-metrics"))]
            if profile_enabled.load(Ordering::Relaxed)
                && matches!(delivery.kind, UiEventKind::Click(_))
            {
                eprintln!(
                    "argui-gallery-profile click_js_callback_ms={:.3}",
                    entered.elapsed().as_secs_f64() * 1000.0
                );
            }
            #[cfg(any(debug_assertions, feature = "dev-metrics"))]
            {
                work += entered.elapsed();
                deliveries += 1;
                window_deliveries += u64::from(matches!(
                    delivery.kind,
                    UiEventKind::VirtualWindowChanged { .. }
                ));
            }
        }
        let generation = dispatch.borrow().generation;
        deliver_services(gallery, &inbox.services, generation, services.registry)?;
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        let mut latest_profile = None;
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        while let Ok(profile) = inbox.profiles.try_recv() {
            latest_profile = Some(profile);
        }
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        if profile_enabled.load(Ordering::Relaxed)
            && let Some(profile) = latest_profile
        {
            gallery.deliver_profile(&profile)?;
        }
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        let entered = Instant::now();
        gallery.tick(started.elapsed().as_secs_f64() * 1000.0)?;
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        {
            work += entered.elapsed();
            ticks += 1;
        }
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        if profile_enabled.load(Ordering::Relaxed) && ticks.is_multiple_of(5) {
            counts.report(deliveries, ticks, work, started.elapsed());
            eprintln!("argui-gallery-profile virtual_window_deliveries={window_deliveries}");
        }
        let delay = gallery.next_wake(started.elapsed().as_secs_f64() * 1000.0)?;
        let delay = if reload.watcher.is_some() {
            delay.min(Duration::from_millis(100))
        } else {
            delay
        };
        std::thread::park_timeout(delay);
    }
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    if profile_enabled.load(Ordering::Relaxed) {
        counts.report(deliveries, ticks, work, started.elapsed());
    }
    Ok(())
}

/// Delivers completed requests only to their still-live JavaScript generation.
/// `gallery` receives JSON, `responses` is the native worker channel, and
/// `session` identifies the current mounted application.
///
/// # Errors
/// Returns an error if a response callback fails in QuickJS.
fn deliver_services(
    gallery: &QuickJsGallery,
    responses: &Receiver<ServiceResponse>,
    session: u32,
    registry: &crate::services::ServiceRegistry,
) -> Result<(), String> {
    for response in responses.try_iter() {
        if response.session == u32::MAX && response.window != "main" {
            registry.route_event(&response);
            continue;
        }
        if response.session == session || response.session == u32::MAX {
            gallery.deliver_service(&response.json().to_string())?;
        }
    }
    Ok(())
}
