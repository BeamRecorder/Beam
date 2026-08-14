use serde::{Deserialize, Serialize};

use crate::CaptureError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InputAccessState {
    Available,
    PermissionRequired,
    InstallationRequired,
    Unavailable,
    Denied,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputAccessStatus {
    pub state: InputAccessState,
    pub can_request: bool,
    pub clicks: bool,
    pub shortcuts: bool,
    pub records_text: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mouse_devices: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keyboard_devices: Option<usize>,
}

impl InputAccessStatus {
    #[must_use]
    pub fn available(mouse_devices: Option<usize>, keyboard_devices: Option<usize>) -> Self {
        Self {
            state: InputAccessState::Available,
            can_request: false,
            clicks: mouse_devices.is_none_or(|count| count > 0),
            shortcuts: keyboard_devices.is_none_or(|count| count > 0),
            records_text: false,
            mouse_devices,
            keyboard_devices,
        }
    }

    #[must_use]
    pub fn required() -> Self {
        Self {
            state: InputAccessState::PermissionRequired,
            can_request: true,
            clicks: false,
            shortcuts: false,
            records_text: false,
            mouse_devices: None,
            keyboard_devices: None,
        }
    }

    #[must_use]
    pub fn unavailable() -> Self {
        Self {
            state: InputAccessState::Unavailable,
            can_request: false,
            clicks: false,
            shortcuts: false,
            records_text: false,
            mouse_devices: None,
            keyboard_devices: None,
        }
    }
}

#[must_use]
pub fn input_access_status() -> InputAccessStatus {
    #[cfg(target_os = "linux")]
    return crate::screen::linux::linux_input_access_status();
    #[cfg(target_os = "macos")]
    return if crate::cursor::mac::input_access_granted() {
        InputAccessStatus::available(None, None)
    } else {
        InputAccessStatus::required()
    };
    #[cfg(windows)]
    return InputAccessStatus::available(None, None);
    #[allow(unreachable_code)]
    InputAccessStatus::unavailable()
}

pub fn request_input_access() -> Result<InputAccessStatus, CaptureError> {
    #[cfg(target_os = "linux")]
    return crate::screen::linux::request_linux_input_access();
    #[cfg(target_os = "macos")]
    return Ok(if crate::cursor::mac::request_input_access() {
        InputAccessStatus::available(None, None)
    } else {
        InputAccessStatus {
            state: InputAccessState::Denied,
            ..InputAccessStatus::required()
        }
    });
    #[cfg(windows)]
    return Ok(InputAccessStatus::available(None, None));
    #[allow(unreachable_code)]
    Ok(InputAccessStatus::unavailable())
}

pub fn shutdown_input_access() {
    #[cfg(target_os = "linux")]
    crate::screen::linux::shutdown_linux_input_access();
}
