//! Native window and embedded QuickJS process for the shared gallery module.

use std::{
    collections::HashMap,
    path::PathBuf,
    rc::Rc,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64},
        mpsc::{self, Receiver, Sender},
    },
};

#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
use crate::desktop_application::{
    BeamApp, beam_config, register_application_services, register_auxiliary_windows,
    register_ui_state_services, runtime_service_event,
};
#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
use crate::hot_reload::dev_bundle_path;
use crate::{
    QuickJsGallery,
    effects::registry_from_json,
    hot_reload::{BundleWatcher, Dispatch},
    native_metrics::control_request,
    services::{ActorSession, ServiceChannels, ServiceRegistry, ServiceResponse},
    telemetry::JsCounts,
};
#[cfg(any(debug_assertions, feature = "dev-metrics"))]
use crate::{
    native_metrics::forward_profile,
    telemetry::{ProfileSummary, observe_profile, report_remaining},
};
use argui_host::Host;
#[cfg(target_os = "android")]
use argui_platform::WindowConfig;
use argui_platform::WindowKey;
use argui_render::{EffectRegistry, RendererConfig};
#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
use argui_runtime::{
    NativeHostApplicationChannels, run_native_host_application_with_text_engine_and_windows,
};
use argui_runtime::{
    NativeHostAssets, NativeHostBatch, NativeHostControl, NativeHostDelivery, RuntimeError,
};
use serde_json::Value;

mod auxiliary;
mod auxiliary_types;
mod deliveries;
mod scene;
pub(crate) use auxiliary::WindowGate;
#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
mod fonts;
mod js_loop;
mod js_loop_types;
mod paths;
mod relay;
mod renderer;
#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
use fonts::beam_text_engine;
use js_loop::{JsLoopInbox, ReloadControl, run_js_loop};
pub(crate) use relay::RelayBatch;
use relay::spawn_main_relay;
use renderer::gallery_blur_algorithm;

#[cfg(target_os = "android")]
const NOTO_SANS: &[u8] = include_bytes!("../../fonts/NotoSans-Regular.ttf");

/// Runs the embedded Solid gallery in a desktop native window.
///
/// # Errors
/// Returns an error if the schema, gallery bundle, QuickJS engine, or native window cannot start.
#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
pub fn run_desktop() -> Result<(), Box<dyn std::error::Error>> {
    let services = Arc::new(ServiceRegistry::with_builtins());
    crate::beam::register(&services)?;
    run_desktop_with_services(services)
}

/// Runs the desktop gallery with application-registered native services.
/// `services` contains the operations available to its TSX components.
/// When `ARGUI_VALIDATE_ONLY` is set, validates `ARGUI_APP_BUNDLE` without
/// creating a window and does not use `services`.
///
/// # Errors
/// Returns an error if the gallery, native window, or JavaScript engine fails.
#[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
pub fn run_desktop_with_services(
    services: Arc<ServiceRegistry>,
) -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var_os("ARGUI_VALIDATE_ONLY").is_some() {
        return crate::validate::validate_app_bundle();
    }
    let mut config = beam_config()?;
    let auxiliary_specs = config.windows.split_off(1);
    let gates = auxiliary_specs
        .iter()
        .map(|spec| {
            (
                spec.key.as_str().to_owned(),
                Arc::new(WindowGate::default()),
            )
        })
        .collect::<HashMap<_, _>>();
    if let Ok(title) = std::env::var("ARGUI_APP_TITLE") {
        config.windows[0].window.title = title;
    }
    let (application_sender, application_requests) = mpsc::channel();
    let editor_canvas = if crate::editor::is_editor() {
        Some(crate::editor::register(
            &services,
            crate::beam::projects_root()?,
        )?)
    } else {
        None
    };
    let gpu_canvases = argui_render::GpuCanvasRegistry::new(editor_canvas)?;
    register_application_services(&services, application_sender.clone(), config.tray.clone());
    register_auxiliary_windows(
        &services,
        application_sender.clone(),
        auxiliary_specs,
        &gates,
    );
    let region = Arc::new(Mutex::new(
        crate::desktop_application::region::RegionState::default(),
    ));
    crate::desktop_application::region::register(&services, application_sender.clone(), &region);
    let model_services = Arc::clone(&services);
    let picker_services = Arc::clone(&services);
    let event_services = Arc::clone(&services);
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    let profiles = Arc::new(Mutex::new(ProfileSummary::default()));
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    let observed = Arc::clone(&profiles);
    let bundle_path = std::env::var_os("ARGUI_APP_BUNDLE")
        .map(PathBuf::from)
        .or_else(dev_bundle_path)
        .or_else(paths::running_bundle_path);
    let bundle_path = paths::scene_bundle_path(
        bundle_path,
        std::env::args().any(|argument| argument == "--settings"),
        crate::editor::is_editor(),
    );
    let result = run_gallery(
        bundle_path,
        services,
        gates.clone(),
        |host,
         assets,
         batches,
         deliveries,
         effects,
         profile_sender,
         profile_enabled,
         service_sender| {
            crate::desktop_application::register_window_picker_services(
                &picker_services,
                application_sender,
                service_sender.clone(),
            );
            #[cfg(any(debug_assertions, feature = "dev-metrics"))]
            let frames = AtomicU64::new(0);
            let text_engine = beam_text_engine();
            let mut native_windows = vec![WindowKey::main()];
            native_windows.extend(gates.keys().map(WindowKey::new));
            let mut extra_text_engines = native_windows
                .iter()
                .filter(|key| **key != WindowKey::main())
                .map(|key| (key.clone(), beam_text_engine()))
                .collect::<Vec<_>>();
            extra_text_engines.push((WindowKey::new("region"), beam_text_engine()));
            run_native_host_application_with_text_engine_and_windows(
                config,
                RendererConfig::default()
                    .gpu_canvases(gpu_canvases)
                    .profiling(cfg!(debug_assertions) || cfg!(feature = "dev-metrics"))
                    .blur_algorithm(gallery_blur_algorithm())
                    .effects(effects),
                text_engine,
                host,
                assets,
                NativeHostApplicationChannels {
                    batches,
                    events: deliveries,
                    requests: application_requests,
                },
                native_windows,
                extra_text_engines,
                BeamApp::new(service_sender.clone(), region, model_services),
                move |event| {
                    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
                    {
                        forward_profile(&event, &profile_sender, &profile_enabled, &frames);
                        observe_profile(&observed, &event, "quickjs");
                    }
                    #[cfg(not(any(debug_assertions, feature = "dev-metrics")))]
                    let _ = (&profile_sender, &profile_enabled);
                    if let Some(response) = runtime_service_event(&event) {
                        event_services.route_event(&response);
                    }
                    event_services.wake_window("main");
                },
            )
        },
    );
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    report_remaining(&profiles, "quickjs");
    result
}

/// Runs the embedded Solid gallery from Android's native activity.
///
/// `android_app` is the activity handle passed by Android. Returns after the
/// activity's event loop exits.
///
/// # Errors
/// Returns an error if the schema, gallery bundle, QuickJS engine, or native window cannot start.
#[cfg(target_os = "android")]
pub fn run_android(
    android_app: argui_runtime::mobile::android::AndroidApp,
) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    let profiles = Arc::new(Mutex::new(ProfileSummary::default()));
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    let observed = Arc::clone(&profiles);
    let bundle_path = cfg!(debug_assertions)
        .then(|| {
            android_app
                .internal_data_path()
                .map(|path| path.join("gallery-core.mjs"))
        })
        .flatten();
    let result = run_gallery(
        bundle_path,
        Arc::new(ServiceRegistry::with_builtins()),
        HashMap::new(),
        |host,
         assets,
         batches,
         deliveries,
         effects,
         profile_sender,
         profile_enabled,
         _service_sender| {
            #[cfg(any(debug_assertions, feature = "dev-metrics"))]
            let frames = AtomicU64::new(0);
            let text_engine = argui_text::TextEngine::from_embedded_fonts(
                [NOTO_SANS],
                "Noto Sans",
                "Noto Sans",
                "Noto Sans",
            );
            argui_runtime::run_android_native_host_with_text_engine(
                android_app,
                WindowConfig {
                    title: "Argui Gallery / QuickJS".into(),
                    ..WindowConfig::default()
                },
                RendererConfig::default()
                    .profiling(cfg!(debug_assertions) || cfg!(feature = "dev-metrics"))
                    .blur_algorithm(gallery_blur_algorithm())
                    .effects(effects),
                text_engine,
                host,
                assets,
                batches,
                deliveries,
                move |event| {
                    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
                    {
                        forward_profile(&event, &profile_sender, &profile_enabled, &frames);
                        observe_profile(&observed, &event, "quickjs");
                    }
                    #[cfg(not(any(debug_assertions, feature = "dev-metrics")))]
                    let _ = (&profile_sender, &profile_enabled, event);
                },
            )
        },
    );
    #[cfg(any(debug_assertions, feature = "dev-metrics"))]
    report_remaining(&profiles, "quickjs");
    result
}

/// Starts the JavaScript actor and passes its host channels to `launch`.
///
/// `bundle_path` optionally points to a development bundle watched at runtime.
/// `launch` owns the native UI event loop and returns its runtime result.
/// Returns after the event loop exits and signals the JavaScript actor to stop.
///
/// # Errors
/// Returns an error if the schema, embedded bundle, QuickJS engine, or native window cannot start.
fn run_gallery(
    bundle_path: Option<PathBuf>,
    services: Arc<ServiceRegistry>,
    gates: HashMap<String, Arc<WindowGate>>,
    launch: impl FnOnce(
        Host,
        NativeHostAssets,
        Receiver<NativeHostBatch>,
        Sender<NativeHostDelivery>,
        EffectRegistry,
        Sender<String>,
        Arc<AtomicBool>,
        Sender<ServiceResponse>,
    ) -> Result<(), RuntimeError>,
) -> Result<(), Box<dyn std::error::Error>> {
    let host = Host::with_builtins()?;
    let contract_json =
        include_str!("../../../vendor/argui/packages/host/src/contract.generated.json");
    let contract: Value = serde_json::from_str(contract_json)?;
    if contract["abiHash"].as_str() != Some(&host.abi_hash().to_string()) {
        return Err("generated JavaScript contract is stale; run bun run generate:jsx".into());
    }
    let source = match &bundle_path {
        Some(path) => {
            std::fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))?
        }
        None => return Err("ARGUI_APP_BUNDLE must name the built TSX bundle".into()),
    };

    let (wire_sender, wire_receiver) = mpsc::channel();
    let (batch_sender, batches) = mpsc::channel();
    let (errors_sender, errors) = mpsc::channel();
    spawn_main_relay(wire_receiver, batch_sender.clone(), errors_sender);

    let (deliveries, native_events) = mpsc::channel::<NativeHostDelivery>();
    let (main_events, events) = mpsc::channel();
    let (service_sender, service_responses) = mpsc::channel();
    #[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
    register_ui_state_services(&services, service_sender.clone());
    let stop_auxiliary = Arc::new(AtomicBool::new(false));
    let auxiliary_events = auxiliary::spawn_all(
        &source,
        contract_json,
        &gates,
        Arc::clone(&services),
        batch_sender.clone(),
        Arc::clone(&stop_auxiliary),
    )?;
    deliveries::route_deliveries(
        native_events,
        main_events,
        auxiliary_events,
        Arc::clone(&services),
    );
    let runtime_service_sender = service_sender.clone();
    let actor_services = Arc::clone(&services);
    let (profile_sender, _profile_events) = mpsc::channel();
    let profile_enabled = Arc::new(AtomicBool::new(false));
    let actor_profile_enabled = Arc::clone(&profile_enabled);
    let (stop_sender, stop) = mpsc::channel();
    let (ready_sender, ready) = mpsc::channel();
    let asset_bundle_path = bundle_path.clone();
    std::thread::spawn(move || {
        let _session = ActorSession::new(Arc::clone(&actor_services), 1);
        actor_services.register_session(1, "main", service_sender.clone());
        let batch_count = Arc::new(AtomicU64::new(0));
        let operation_count = Arc::new(AtomicU64::new(0));
        let mut dispatch = Dispatch::new(1, Arc::clone(&batch_count), Arc::clone(&operation_count));
        let route = Rc::clone(&dispatch);
        let control_sender = wire_sender.clone();
        let control_enabled = Arc::clone(&actor_profile_enabled);
        let request_services = Arc::clone(&actor_services);
        let cancel_services = Arc::clone(&actor_services);
        let request_sender = service_sender.clone();
        let gallery = QuickJsGallery::new_with_services(
            &source,
            contract_json,
            "mountGallery",
            move |json| route.borrow_mut().accept(&json),
            move |json| control_request(&json, &control_sender, &control_enabled),
            move |json| {
                request_services
                    .submit(1, &json, request_sender.clone())
                    .err()
                    .unwrap_or_default()
            },
            move |json| {
                cancel_services
                    .cancel_json(1, &json)
                    .err()
                    .unwrap_or_default()
            },
        );
        let mut scene = match gallery {
            Ok(gallery) => scene::NativeScene {
                gallery,
                window: "main",
            },
            Err(error) => {
                let _ = ready_sender.send(Err(error));
                return;
            }
        };
        if wire_sender
            .send(RelayBatch {
                operations: Vec::new(),
                controls: vec![NativeHostControl::SetRendererProfiling(false)],
                acknowledgement: None,
            })
            .is_err()
        {
            let _ = ready_sender.send(Err("native UI thread closed".into()));
            return;
        }
        let first = std::mem::take(&mut dispatch.borrow_mut().pending);
        for operations in first {
            if wire_sender
                .send(RelayBatch {
                    operations,
                    controls: Vec::new(),
                    acknowledgement: None,
                })
                .is_err()
            {
                let _ = ready_sender.send(Err("native UI thread closed".into()));
                return;
            }
        }
        dispatch.borrow_mut().activate(wire_sender.clone());
        let mut reload = ReloadControl {
            watcher: bundle_path.map(BundleWatcher::new),
            contract_json,
            sender: &wire_sender,
        };
        let counts = JsCounts::new(batch_count, operation_count);
        #[cfg(any(debug_assertions, feature = "dev-metrics"))]
        {
            let (startup_batches, startup_operations) = counts.startup();
            eprintln!(
                "argui-gallery-profile mode=quickjs startup_batches={startup_batches} startup_operations={startup_operations}"
            );
        }
        let effects = scene
            .gallery
            .effect_definitions_json()
            .and_then(|json| registry_from_json(&json));
        let effects = match effects {
            Ok(effects) => effects,
            Err(error) => {
                let _ = ready_sender.send(Err(error));
                return;
            }
        };
        let _ = ready_sender.send(Ok(effects));
        if let Err(error) = run_js_loop(
            &mut scene.gallery,
            &mut dispatch,
            &mut reload,
            JsLoopInbox {
                events,
                #[cfg(any(debug_assertions, feature = "dev-metrics"))]
                profiles: _profile_events,
                errors,
                stop,
                services: service_responses,
            },
            &actor_profile_enabled,
            &counts,
            ServiceChannels {
                registry: &actor_services,
                sender: &service_sender,
            },
        ) {
            eprintln!("{error}");
        }
        drop(scene);
        actor_services.cancel_session(dispatch.borrow().generation);
    });
    let effects = ready.recv().map_err(|error| error.to_string())??;

    let assets = if let Some(manifest) = std::env::var_os("ARGUI_APP_ASSETS") {
        beam_native_assets::load_manifest(&PathBuf::from(manifest))?
    } else {
        let manifest = paths::fallback_asset_manifest(
            asset_bundle_path.as_deref(),
            crate::files::ASSET_MANIFEST,
            crate::files::DEVELOPMENT_ASSET_MANIFEST,
        )?;
        beam_native_assets::load_manifest(&manifest)?
    };
    let result = launch(
        host,
        assets,
        batches,
        deliveries,
        effects,
        profile_sender,
        profile_enabled,
        runtime_service_sender,
    );
    let _ = stop_sender.send(());
    stop_auxiliary.store(true, std::sync::atomic::Ordering::Release);
    services.wake_all_actors();
    result?;
    Ok(())
}
