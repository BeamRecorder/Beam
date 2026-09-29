//! Only advertise writable icon settings for the currently active supported desktop.

use crate::CaptureError;
use std::process::Command;

pub(super) struct IconSetting {
    schema: &'static str,
    key: &'static str,
    visible: bool,
}

pub(super) fn setting() -> Result<Option<IconSetting>, CaptureError> {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let schema = if desktop.split(':').any(|value| value.contains("cinnamon")) {
        "org.nemo.desktop"
    } else if desktop.split(':').any(|value| value == "mate") {
        "org.mate.background"
    } else {
        return Ok(None);
    };
    let key = "show-desktop-icons";
    let Some(keys) = query(&["list-keys", schema])? else {
        return Ok(None);
    };
    if !keys.lines().any(|candidate| candidate == key)
        || query(&["writable", schema, key])?.as_deref() != Some("true")
    {
        return Ok(None);
    }
    let visible = match query(&["get", schema, key])?.as_deref() {
        Some("true") => true,
        Some("false") => false,
        _ => return Ok(None),
    };
    Ok(Some(IconSetting {
        schema,
        key,
        visible,
    }))
}

impl IconSetting {
    pub(super) fn hide(&self) -> Result<(), CaptureError> {
        self.write(false)
    }
    pub(super) fn restore(&self) -> Result<(), CaptureError> {
        self.write(self.visible)
    }
    fn write(&self, visible: bool) -> Result<(), CaptureError> {
        query(&[
            "set",
            self.schema,
            self.key,
            if visible { "true" } else { "false" },
        ])?
        .ok_or_else(|| CaptureError::Backend("could not update desktop icon visibility".into()))?;
        Ok(())
    }
}

fn query(args: &[&str]) -> Result<Option<String>, CaptureError> {
    let output = match Command::new("gsettings").args(args).output() {
        Ok(output) => output,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(CaptureError::Backend(error.to_string())),
    };
    Ok(output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned()))
}
