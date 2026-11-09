use crate::CaptureError;

/// Quartz can temporarily disable a tap, or deliver an older disable notification
/// after preparation. Inspect the live tap before treating this as lost access.
pub(crate) fn restore_mouse_tap(
    access_granted: impl FnOnce() -> bool,
    is_enabled: impl Fn() -> bool,
    enable: impl FnOnce(),
) -> Result<bool, CaptureError> {
    if is_enabled() {
        return Ok(false);
    }
    if !access_granted() {
        return Err(CaptureError::PermissionDenied(
            "macOS Input Monitoring was revoked. Enable Beam in System Settings > Privacy & Security > Input Monitoring, then start a new recording.".into(),
        ));
    }
    enable();
    if is_enabled() {
        Ok(true)
    } else {
        Err(CaptureError::Backend(
            "macOS mouse event tap remained disabled after re-enabling it with Input Monitoring granted".into(),
        ))
    }
}

#[cfg(test)]
#[path = "mac_tap_tests.rs"]
mod tests;
