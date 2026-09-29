//! Event pump for the embedded QuickJS actor.

use std::{
    cell::RefCell,
    rc::Rc,
    sync::{Arc, atomic::AtomicBool, mpsc::Receiver},
    time::{Duration, Instant},
};

use crate::{
    QuickJsGallery,
    delivery::{coalesce_virtual_windows, coalesce_window_resizes, event_json},
    hot_reload::{Dispatch, ReloadContext, reload_gallery},
    services::{ServiceChannels, ServiceResponse},
    telemetry::JsCounts,
};
use argui_runtime::NativeHostDelivery;
#[cfg(any(debug_assertions, feature = "dev-metrics"))]
use argui_ui::UiEventKind;
#[cfg(any(debug_assertions, feature = "dev-metrics"))]
use std::sync::atomic::Ordering;

use super::js_loop_types::LoopMetrics;
pub(super) use super::js_loop_types::{JsLoopInbox, ReloadControl};

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
    let mut metrics = LoopMetrics::default();
    #[cfg(not(any(debug_assertions, feature = "dev-metrics")))]
    let _ = counts;
    loop {
        if inbox.stop.try_recv().is_ok() {
            break;
        }
        if let Ok(error) = inbox.errors.try_recv() {
            return Err(format!("native commit rejected: {error}"));
        }
        reload_scene(
            gallery,
            dispatch,
            reload,
            counts,
            profile_enabled,
            &services,
        );
        let generation = dispatch.borrow().generation;
        deliver_services(gallery, &inbox.services, generation, services.registry)?;
        deliver_input(
            gallery,
            dispatch,
            &inbox.events,
            profile_enabled,
            &mut metrics,
        )?;
        let generation = dispatch.borrow().generation;
        deliver_services(gallery, &inbox.services, generation, services.registry)?;
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        deliver_profiles(gallery, &inbox.profiles, profile_enabled)?;
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        let entered = Instant::now();
        gallery.tick(started.elapsed().as_secs_f64() * 1000.0)?;
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        {
            metrics.work += entered.elapsed();
            metrics.ticks += 1;
        }
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        if profile_enabled.load(Ordering::Relaxed) && metrics.ticks.is_multiple_of(5) {
            counts.report(
                metrics.deliveries,
                metrics.ticks,
                metrics.work,
                started.elapsed(),
            );
            eprintln!(
                "argui-gallery-profile virtual_window_deliveries={}",
                metrics.window_deliveries
            );
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
        counts.report(
            metrics.deliveries,
            metrics.ticks,
            metrics.work,
            started.elapsed(),
        );
    }
    Ok(())
}

fn reload_scene(
    gallery: &mut QuickJsGallery,
    dispatch: &mut Rc<RefCell<Dispatch>>,
    reload: &mut ReloadControl<'_>,
    counts: &JsCounts,
    profile_enabled: &Arc<AtomicBool>,
    services: &ServiceChannels<'_>,
) {
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
}

fn deliver_input(
    gallery: &QuickJsGallery,
    dispatch: &Rc<RefCell<Dispatch>>,
    events: &Receiver<NativeHostDelivery>,
    profile_enabled: &AtomicBool,
    metrics: &mut LoopMetrics,
) -> Result<(), String> {
    #[cfg(not(any(debug_assertions, feature = "dev-metrics")))]
    let _ = (profile_enabled, metrics);
    let burst = events.try_iter().collect();
    let burst = if crate::editor::is_editor() {
        crate::coalesce_absolute_pointer_moves(burst)
    } else {
        burst
    };
    for delivery in coalesce_virtual_windows(burst) {
        if delivery.callback.node.generation() != dispatch.borrow().generation {
            continue;
        }
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        let entered = Instant::now();
        gallery.deliver(&event_json(&delivery).to_string())?;
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        if profile_enabled.load(Ordering::Relaxed) && matches!(delivery.kind, UiEventKind::Click(_))
        {
            eprintln!(
                "argui-gallery-profile click_js_callback_ms={:.3}",
                entered.elapsed().as_secs_f64() * 1000.0
            );
        }
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        {
            metrics.work += entered.elapsed();
            metrics.deliveries += 1;
            metrics.window_deliveries += u64::from(matches!(
                delivery.kind,
                UiEventKind::VirtualWindowChanged { .. }
            ));
        }
    }
    Ok(())
}

#[cfg(any(debug_assertions, feature = "dev-metrics"))]
fn deliver_profiles(
    gallery: &QuickJsGallery,
    profiles: &Receiver<String>,
    profile_enabled: &AtomicBool,
) -> Result<(), String> {
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    let mut latest_profile = None;
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    while let Ok(profile) = profiles.try_recv() {
        latest_profile = Some(profile);
    }
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    if profile_enabled.load(Ordering::Relaxed)
        && let Some(profile) = latest_profile
    {
        gallery.deliver_profile(&profile)?;
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
    for response in coalesce_window_resizes(responses.try_iter().collect()) {
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
