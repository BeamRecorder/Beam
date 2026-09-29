//! EWMH panel visibility and supported desktop icon settings, never wallpaper windows.

#[path = "linux/icons.rs"]
mod icons;
use super::{DesktopCapabilities, DesktopOptions};
use crate::{CaptureError, screen::linux::x11};
use x11rb::{
    connection::Connection,
    protocol::xproto::{AtomEnum, ConnectionExt, MapState},
};

#[derive(Default)]
pub(super) struct Appearance {
    panels: Vec<(u32, Vec<u8>)>,
    icons: Option<icons::IconSetting>,
}

pub(super) fn capabilities() -> Result<DesktopCapabilities, CaptureError> {
    Ok(DesktopCapabilities {
        taskbar: x11::desktop_available(),
        desktop_icons: icons::setting()?.is_some(),
        capture_only: false,
    })
}

impl Appearance {
    pub(super) fn apply(&mut self, options: DesktopOptions) -> Result<(), CaptureError> {
        if options.hide_desktop_icons {
            let setting =
                icons::setting()?.ok_or_else(|| error("desktop icon hiding is unavailable"))?;
            // Remember the exact setting before writing, including an already hidden desktop.
            self.icons = Some(setting);
            if let Some(setting) = &self.icons {
                setting.hide()?;
            }
        }
        if options.hide_taskbar {
            let (connection, screen) = x11::connect()?;
            let clients = x11::atom(&connection, b"_NET_CLIENT_LIST")?;
            let kind = x11::atom(&connection, b"_NET_WM_WINDOW_TYPE")?;
            let dock = x11::atom(&connection, b"_NET_WM_WINDOW_TYPE_DOCK")?;
            let windows = connection
                .get_property(
                    false,
                    x11::root(&connection, screen),
                    clients,
                    AtomEnum::WINDOW,
                    0,
                    u32::MAX,
                )
                .map_err(x11::backend_error)?
                .reply()
                .map_err(x11::backend_error)?;
            for window in windows.value32().into_iter().flatten() {
                let Ok(attributes) = connection
                    .get_window_attributes(window)
                    .map_err(x11::backend_error)?
                    .reply()
                else {
                    continue;
                };
                if attributes.map_state != MapState::VIEWABLE {
                    continue;
                }
                let property = connection
                    .get_property(false, window, kind, AtomEnum::ATOM, 0, 32)
                    .map_err(x11::backend_error)?
                    .reply()
                    .map_err(x11::backend_error)?;
                if !property
                    .value32()
                    .is_some_and(|mut kinds| kinds.any(|value| value == dock))
                {
                    continue;
                }
                let class = connection
                    .get_property(false, window, AtomEnum::WM_CLASS, AtomEnum::STRING, 0, 1024)
                    .map_err(x11::backend_error)?
                    .reply()
                    .map_err(x11::backend_error)?
                    .value;
                self.panels.push((window, class));
                connection
                    .unmap_window(window)
                    .map_err(x11::backend_error)?
                    .check()
                    .map_err(x11::backend_error)?;
            }
            connection.flush().map_err(x11::backend_error)?;
        }
        Ok(())
    }

    pub(super) fn excluded_window_handles(&self) -> Vec<String> {
        Vec::new()
    }

    fn restore_panels(&mut self) -> Result<(), CaptureError> {
        let mut failures = Vec::new();
        if !self.panels.is_empty() {
            let (connection, _) = x11::connect()?;
            self.panels.retain(|(window, class)| {
                // A destroyed/replaced panel must not cause a different window to be mapped.
                let cookie = match connection.get_property(
                    false,
                    *window,
                    AtomEnum::WM_CLASS,
                    AtomEnum::STRING,
                    0,
                    1024,
                ) {
                    Ok(cookie) => cookie,
                    Err(error) => {
                        failures.push(error.to_string());
                        return true;
                    }
                };
                let property = match cookie.reply() {
                    Ok(property) => property,
                    Err(x11rb::errors::ReplyError::X11Error(error))
                        if error.error_kind == x11rb::protocol::ErrorKind::Window =>
                    {
                        return false;
                    }
                    Err(error) => {
                        failures.push(error.to_string());
                        return true;
                    }
                };
                if &property.value != class {
                    return false;
                }
                let result = connection
                    .map_window(*window)
                    .map_err(x11::backend_error)
                    .and_then(|cookie| cookie.check().map_err(x11::backend_error));
                if let Err(error) = result {
                    failures.push(error.to_string());
                    true
                } else {
                    false
                }
            });
            connection.flush().map_err(x11::backend_error)?;
        }
        if failures.is_empty() {
            Ok(())
        } else {
            Err(error(failures.join("; ")))
        }
    }

    pub(super) fn restore(&mut self) -> Result<(), CaptureError> {
        let mut failures = Vec::new();
        if let Err(error) = self.restore_panels() {
            failures.push(error.to_string());
        }
        if let Some(setting) = &self.icons {
            match setting.restore() {
                Ok(()) => self.icons = None,
                Err(error) => failures.push(error.to_string()),
            }
        }
        if failures.is_empty() {
            Ok(())
        } else {
            Err(error(failures.join("; ")))
        }
    }
}

fn error(message: impl Into<String>) -> CaptureError {
    CaptureError::Backend(message.into())
}
