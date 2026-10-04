use ashpd::{WindowIdentifier, desktop::Color};

use crate::{CaptureError, NativeCaptureErrorCode};

pub(super) fn pick(parent_window_id: u32) -> Result<String, CaptureError> {
    // Electron runs in XWayland on Wayland hosts; the parent identifier is X11.
    // Keep this operation in its own process so waiting for the portal never
    // blocks the recording engine's protocol loop.
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| CaptureError::Backend(format!("color picker runtime failed: {error}")))?;
    runtime.block_on(async {
        let color = Color::pick()
            .identifier(WindowIdentifier::from_xid(parent_window_id.into()))
            .send()
            .await
            .map_err(map_portal_error)?
            .response()
            .map_err(map_portal_error)?;
        srgb_hex([color.red(), color.green(), color.blue()])
    })
}

fn srgb_hex(channels: [f64; 3]) -> Result<String, CaptureError> {
    if channels
        .iter()
        .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
    {
        return Err(CaptureError::Protocol(
            "color portal returned invalid sRGB channels".into(),
        ));
    }
    let [red, green, blue] = channels.map(|value| (value * 255.0).round() as u8);
    Ok(format!("#{red:02x}{green:02x}{blue:02x}"))
}

fn map_portal_error(error: ashpd::Error) -> CaptureError {
    let code = match error {
        ashpd::Error::Response(ashpd::desktop::ResponseError::Cancelled)
        | ashpd::Error::Portal(ashpd::PortalError::Cancelled(_)) => {
            NativeCaptureErrorCode::PortalCancelled
        }
        ashpd::Error::Portal(ashpd::PortalError::NotAllowed(_)) => {
            NativeCaptureErrorCode::PortalDenied
        }
        ashpd::Error::RequiresVersion(_, _) => NativeCaptureErrorCode::PortalVersionUnsupported,
        _ => NativeCaptureErrorCode::PortalUnavailable,
    };
    CaptureError::native(code, format!("screen color selection failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_srgb_endpoints_without_changing_color_space() {
        assert_eq!(srgb_hex([0.0, 0.0, 0.0]).ok().as_deref(), Some("#000000"));
        assert_eq!(srgb_hex([1.0, 1.0, 1.0]).ok().as_deref(), Some("#ffffff"));
    }

    #[test]
    fn rounds_each_channel_to_the_nearest_byte() {
        assert_eq!(srgb_hex([0.5, 0.25, 0.75]).ok().as_deref(), Some("#8040bf"));
        assert_eq!(
            srgb_hex([1.0 / 255.0, 254.0 / 255.0, 0.0]).ok().as_deref(),
            Some("#01fe00")
        );
    }

    #[test]
    fn rejects_out_of_range_and_non_finite_channels() {
        for value in [-0.001, 1.001, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(srgb_hex([value, 0.0, 1.0]).is_err());
        }
    }

    #[test]
    fn preserves_user_cancellation_for_the_ipc_boundary() {
        let error = map_portal_error(ashpd::Error::Response(
            ashpd::desktop::ResponseError::Cancelled,
        ));
        assert_eq!(error.code(), "portal-cancelled");
    }

    #[test]
    fn reports_permissions_and_unavailable_portals_as_errors() {
        assert_eq!(
            map_portal_error(ashpd::Error::Portal(ashpd::PortalError::NotAllowed(
                "denied".into()
            )))
            .code(),
            "portal-denied"
        );
        assert_eq!(
            map_portal_error(ashpd::Error::Response(ashpd::desktop::ResponseError::Other)).code(),
            "portal-unavailable"
        );
        assert_eq!(
            map_portal_error(ashpd::Error::RequiresVersion(1, 2)).code(),
            "portal-version-unsupported"
        );
    }
}
