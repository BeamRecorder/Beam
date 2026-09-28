use crate::{
    CaptureError,
    model::{CaptureCapabilities, PermissionSnapshot, SourceDescriptor},
};

pub fn list_sources() -> Result<Vec<SourceDescriptor>, CaptureError> {
    #[cfg(target_os = "macos")]
    {
        crate::screen::mac::discover_sources()
    }
    #[cfg(windows)]
    {
        crate::screen::win::discover_sources()
    }
    #[cfg(target_os = "linux")]
    {
        if crate::screen::linux::x11::desktop_available() {
            return crate::screen::linux::x11::discover_sources();
        }
        use crate::model::{SourceCapabilities, SourceId, SourceKind, SourceSelectionMode};
        let available =
            crate::screen::linux::probe_native_capabilities(std::time::Duration::from_secs(2))?;
        let mut sources = Vec::new();
        for (supported, id, kind, label) in [
            (
                available.display_capture,
                "portal:monitor",
                SourceKind::Display,
                "Choose a screen",
            ),
            (
                available.window_capture,
                "portal:window",
                SourceKind::Window,
                "Choose a window",
            ),
        ] {
            if supported {
                sources.push(SourceDescriptor {
                    id: SourceId::new(id)?,
                    kind,
                    label: label.into(),
                    is_default: sources.is_empty(),
                    selection_mode: SourceSelectionMode::Portal,
                    display_id: None,
                    capabilities: SourceCapabilities {
                        formats: Vec::new(),
                        supports_cursor_exclusion: available.hidden_cursor,
                    },
                });
            }
        }
        Ok(sources)
    }
}

pub fn capabilities() -> Result<CaptureCapabilities, CaptureError> {
    #[cfg(target_os = "macos")]
    {
        Ok(crate::screen::mac::capabilities())
    }
    #[cfg(windows)]
    {
        Ok(crate::screen::win::capabilities())
    }
    #[cfg(target_os = "linux")]
    {
        if crate::screen::linux::x11::desktop_available() {
            let input = crate::input::input_access_status();
            return Ok(CaptureCapabilities {
                display_capture: true,
                window_capture: true,
                embedded_cursor: true,
                separate_cursor: true,
                cursor_shapes: true,
                cursor_clicks: input.clicks,
                input_shortcuts: input.shortcuts,
                ..Default::default()
            });
        }
        let native =
            crate::screen::linux::probe_native_capabilities(std::time::Duration::from_secs(2))?;
        Ok(CaptureCapabilities {
            display_capture: native.display_capture,
            window_capture: native.window_capture,
            portal_selection: native.portal_selection,
            embedded_cursor: native.embedded_cursor,
            separate_cursor: native.separate_cursor,
            cursor_shapes: native.cursor_shapes,
            cursor_clicks: native.cursor_clicks,
            input_shortcuts: native.cursor_clicks,
            ..Default::default()
        })
    }
}

pub fn permissions() -> PermissionSnapshot {
    #[cfg(target_os = "macos")]
    {
        crate::screen::mac::permissions()
    }
    #[cfg(windows)]
    {
        crate::screen::win::permissions()
    }
    #[cfg(target_os = "linux")]
    {
        PermissionSnapshot {
            screen: Some(if crate::screen::linux::x11::desktop_available() {
                crate::model::PermissionState::Granted
            } else {
                crate::model::PermissionState::PromptRequired
            }),
            accessibility: Some(crate::model::PermissionState::NotApplicable),
        }
    }
}
