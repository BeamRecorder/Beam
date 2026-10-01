use crate::CaptureError;

#[cfg(target_os = "linux")]
mod linux;

/// Select one sRGB pixel through the desktop's color picker, owned by an X11 window.
pub fn pick(parent_window_id: u32) -> Result<String, CaptureError> {
    if parent_window_id == 0 {
        return Err(CaptureError::InvalidConfiguration(
            "screen color selection requires an owning window".into(),
        ));
    }
    #[cfg(target_os = "linux")]
    return linux::pick(parent_window_id);
    #[cfg(not(target_os = "linux"))]
    Err(CaptureError::Unsupported(
        "native portal color selection is only supported on Linux".into(),
    ))
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_a_missing_owner_before_opening_a_portal() {
        assert!(matches!(
            super::pick(0),
            Err(crate::CaptureError::InvalidConfiguration(_))
        ));
    }
}
