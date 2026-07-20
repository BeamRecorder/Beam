use crate::model::{CaptureCapabilities, PermissionSnapshot, PermissionState};

#[must_use]
pub fn capabilities() -> CaptureCapabilities {
    CaptureCapabilities {
        display_capture: true,
        window_capture: true,
        application_capture: true,
        portal_selection: false,
        embedded_cursor: true,
        separate_cursor: true,
        cursor_shapes: false,
        cursor_clicks: true,
        system_audio: true,
        selectable_system_output: false,
        microphone: cfg!(feature = "microphone"),
        selectable_microphone: cfg!(feature = "microphone"),
        camera: cfg!(feature = "camera"),
        selectable_camera: cfg!(feature = "camera"),
        hardware_h264: true,
        hardware_hevc: true,
    }
}

#[must_use]
pub fn permissions() -> PermissionSnapshot {
    PermissionSnapshot {
        screen: Some(
            if screencapturekit::shareable_content::SCShareableContent::get().is_ok() {
                PermissionState::Granted
            } else {
                PermissionState::PromptRequired
            },
        ),
        microphone: Some(media_permission(false)),
        camera: Some(media_permission(true)),
        accessibility: Some(PermissionState::NotApplicable),
    }
}

fn media_permission(video: bool) -> PermissionState {
    use objc2_av_foundation::{
        AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio, AVMediaTypeVideo,
    };

    // SAFETY: AVFoundation exposes both constants for the entire process lifetime.
    let media_type = unsafe {
        if video {
            AVMediaTypeVideo
        } else {
            AVMediaTypeAudio
        }
    };
    let Some(media_type) = media_type else {
        return PermissionState::Unknown;
    };
    // SAFETY: only AVMediaTypeVideo or AVMediaTypeAudio is passed as required by AVFoundation.
    match unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) } {
        AVAuthorizationStatus::Authorized => PermissionState::Granted,
        AVAuthorizationStatus::Denied | AVAuthorizationStatus::Restricted => {
            PermissionState::Denied
        }
        AVAuthorizationStatus::NotDetermined => PermissionState::PromptRequired,
        _ => PermissionState::Unknown,
    }
}
