#![cfg(test)]

use super::capture;
use crate::{
    model::{PortalSourceKind, ScreenSelection},
    screenshot::ScreenshotRequest,
};

#[test]
fn mac_screenshot_rejects_portal_selection_before_requesting_permission() {
    let request = ScreenshotRequest {
        screen: ScreenSelection::Portal {
            kind: PortalSourceKind::Monitor,
            restore_token: None,
        },
        region: None,
        excluded_window_handles: vec![],
        output: std::path::PathBuf::from("screenshot.png"),
    };
    assert!(capture(&request).is_err());
}
