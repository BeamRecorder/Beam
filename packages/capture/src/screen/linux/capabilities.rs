use std::time::Duration;

use ashpd::desktop::screencast::{CursorMode, Screencast, SourceType};
use serde::{Deserialize, Serialize};

use crate::{CaptureError, NativeCaptureErrorCode};

const MIN_PORTAL_VERSION: u32 = 2;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PortalProperties {
    pub version: u32,
    pub monitor: bool,
    pub window: bool,
    pub hidden_cursor: bool,
    pub embedded_cursor: bool,
    pub metadata_cursor: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinuxNativeCapabilities {
    pub backend: String,
    pub portal_version: u32,
    pub display_capture: bool,
    pub window_capture: bool,
    pub portal_selection: bool,
    pub hidden_cursor: bool,
    pub embedded_cursor: bool,
    pub separate_cursor: bool,
    pub cursor_clicks: bool,
    pub cursor_shapes: bool,
    pub pipewire_available: bool,
    pub recording_available: bool,
}

#[must_use]
pub fn evaluate_capabilities(
    portal: PortalProperties,
    pipewire_available: bool,
) -> LinuxNativeCapabilities {
    let portal_selection = portal.version >= MIN_PORTAL_VERSION
        && (portal.monitor || portal.window)
        && pipewire_available;
    LinuxNativeCapabilities {
        backend: "xdg-portal-pipewire".into(),
        portal_version: portal.version,
        display_capture: portal_selection && portal.monitor,
        window_capture: portal_selection && portal.window,
        portal_selection,
        hidden_cursor: portal.hidden_cursor,
        embedded_cursor: portal.embedded_cursor,
        separate_cursor: portal_selection && portal.metadata_cursor,
        cursor_clicks: super::input_helper_supported(),
        cursor_shapes: false,
        pipewire_available,
        // Raw acquisition is deliberately not the product recording gate.
        recording_available: false,
    }
}

pub fn probe_native_capabilities(
    timeout: Duration,
) -> Result<LinuxNativeCapabilities, CaptureError> {
    let runtime = super::runtime::portal_runtime()?;
    let portal = runtime.block_on(async {
        tokio::time::timeout(timeout, query_portal_properties())
            .await
            .map_err(|_| {
                CaptureError::native(
                    NativeCaptureErrorCode::PortalUnavailable,
                    "ScreenCast portal capability probe timed out",
                )
            })?
    })?;
    Ok(evaluate_capabilities(portal, probe_pipewire()))
}

async fn query_portal_properties() -> Result<PortalProperties, CaptureError> {
    let proxy = Screencast::new().await.map_err(map_portal_probe_error)?;
    let version = proxy.version();
    if version < MIN_PORTAL_VERSION {
        return Err(CaptureError::native(
            NativeCaptureErrorCode::PortalVersionUnsupported,
            format!("ScreenCast portal version {version} is older than {MIN_PORTAL_VERSION}"),
        ));
    }
    let sources = proxy
        .available_source_types()
        .await
        .map_err(map_portal_probe_error)?;
    let cursors = proxy
        .available_cursor_modes()
        .await
        .map_err(map_portal_probe_error)?;
    Ok(PortalProperties {
        version,
        monitor: sources.contains(SourceType::Monitor),
        window: sources.contains(SourceType::Window),
        hidden_cursor: cursors.contains(CursorMode::Hidden),
        embedded_cursor: cursors.contains(CursorMode::Embedded),
        metadata_cursor: cursors.contains(CursorMode::Metadata),
    })
}

fn probe_pipewire() -> bool {
    use std::{cell::Cell, rc::Rc};

    let Ok(mainloop) = pipewire::main_loop::MainLoopRc::new(None) else {
        return false;
    };
    let Ok(context) = pipewire::context::ContextRc::new(&mainloop, None) else {
        return false;
    };
    let Ok(core) = context.connect_rc(None) else {
        return false;
    };
    let connected = Rc::new(Cell::new(false));
    let listener_loop = mainloop.clone();
    let listener_connected = connected.clone();
    let _listener = core
        .add_listener_local()
        .done(move |_, _| {
            listener_connected.set(true);
            listener_loop.quit();
        })
        .error({
            let mainloop = mainloop.clone();
            move |_, _, _, _| mainloop.quit()
        })
        .register();
    let timer = mainloop.loop_().add_timer({
        let mainloop = mainloop.clone();
        move |_| mainloop.quit()
    });
    if timer
        .update_timer(Some(Duration::from_secs(1)), None)
        .into_result()
        .is_err()
        || core.sync(0).is_err()
    {
        return false;
    }
    mainloop.run();
    connected.get()
}

fn map_portal_probe_error(error: ashpd::Error) -> CaptureError {
    let code = match error {
        ashpd::Error::RequiresVersion(_, _) => NativeCaptureErrorCode::PortalVersionUnsupported,
        _ => NativeCaptureErrorCode::PortalUnavailable,
    };
    CaptureError::native(code, error.to_string())
}
