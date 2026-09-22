use std::{sync::mpsc, time::Duration};

use block2::RcBlock;
use objc2::runtime::Bool;
use objc2_av_foundation::{
    AVAuthorizationStatus, AVCaptureDevice, AVCaptureDeviceDiscoverySession,
    AVCaptureDevicePosition, AVCaptureDeviceTypeBuiltInWideAngleCamera,
    AVCaptureDeviceTypeContinuityCamera, AVCaptureDeviceTypeDeskViewCamera,
    AVCaptureDeviceTypeExternal, AVMediaTypeVideo,
};
use objc2_foundation::{NSArray, NSString};

use crate::{CameraDevice, CameraError};

fn video_media_type() -> Result<&'static objc2_av_foundation::AVMediaType, CameraError> {
    unsafe { AVMediaTypeVideo }
        .ok_or_else(|| CameraError::Backend("AVFoundation video media type is unavailable".into()))
}

pub(super) fn ensure_permission() -> Result<(), CameraError> {
    let media_type = video_media_type()?;
    match unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) } {
        AVAuthorizationStatus::Authorized => Ok(()),
        AVAuthorizationStatus::Denied | AVAuthorizationStatus::Restricted => Err(
            CameraError::PermissionDenied("macOS camera permission was denied".into()),
        ),
        AVAuthorizationStatus::NotDetermined => {
            let (sender, receiver) = mpsc::sync_channel(1);
            let callback = RcBlock::new(move |granted: Bool| {
                let _ = sender.send(bool::from(granted));
            });
            unsafe {
                AVCaptureDevice::requestAccessForMediaType_completionHandler(media_type, &callback)
            };
            match receiver.recv_timeout(Duration::from_secs(30)) {
                Ok(true) => Ok(()),
                Ok(false) => Err(CameraError::PermissionDenied(
                    "macOS camera permission was denied".into(),
                )),
                Err(_) => Err(CameraError::Backend(
                    "timed out waiting for macOS camera permission".into(),
                )),
            }
        }
        other => Err(CameraError::Backend(format!(
            "unknown macOS camera authorization status: {other:?}"
        ))),
    }
}

pub fn list_cameras() -> Result<Vec<CameraDevice>, CameraError> {
    ensure_permission()?;
    let media_type = video_media_type()?;
    let device_types = NSArray::from_slice(&[
        unsafe { AVCaptureDeviceTypeBuiltInWideAngleCamera },
        unsafe { AVCaptureDeviceTypeExternal },
        unsafe { AVCaptureDeviceTypeContinuityCamera },
        unsafe { AVCaptureDeviceTypeDeskViewCamera },
    ]);
    let discovery = unsafe {
        AVCaptureDeviceDiscoverySession::discoverySessionWithDeviceTypes_mediaType_position(
            &device_types,
            Some(media_type),
            AVCaptureDevicePosition::Unspecified,
        )
    };
    let mut devices: Vec<_> = unsafe { discovery.devices() }
        .iter()
        .map(|device| CameraDevice {
            id: unsafe { device.uniqueID() }.to_string(),
            name: unsafe { device.localizedName() }.to_string(),
        })
        .collect();
    devices.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(devices)
}

pub(super) fn open_device(id: &str) -> Result<objc2::rc::Retained<AVCaptureDevice>, CameraError> {
    let id = NSString::from_str(id);
    unsafe { AVCaptureDevice::deviceWithUniqueID(&id) }
        .ok_or_else(|| CameraError::DeviceUnavailable(id.to_string()))
}

#[path = "../../test/macos/catalog.rs"]
mod catalog_checks;
