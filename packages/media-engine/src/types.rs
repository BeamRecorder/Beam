use beam_media_core::LatestFrame;
use beam_media_manifest::{ProjectId, SessionId, SessionManifest, TrackKind};
use beam_media_session::{AudioSelection, CameraSelection, CapturedCameraFrame};
use std::{path::PathBuf, sync::Arc};

pub const API_VERSION: u32 = 1;
pub type CameraPreview = Arc<LatestFrame<CapturedCameraFrame>>;

/// The output root belongs to the host; views supply only a typed project ID.
#[derive(Debug, Clone)]
pub struct RecordingConfig {
    pub output: OutputLocation,
    pub project_id: ProjectId,
    pub screen: Option<beam_screen::ScreenRequest>,
    pub camera: CameraSelection,
    pub microphone: AudioSelection,
    pub system_audio: AudioSelection,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RecordingState {
    Idle,
    Preparing,
    Armed,
    Recording,
    Paused,
    Finalizing,
    Completed,
    Failed,
    Interrupted,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStatus {
    pub state: RecordingState,
    pub session_id: Option<SessionId>,
    pub manifest_path: Option<PathBuf>,
    pub manifest: Option<SessionManifest>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingEvent {
    pub sequence: u64,
    pub session_id: Option<SessionId>,
    pub track: Option<TrackKind>,
    pub timestamp_ns: u64,
    pub state: RecordingState,
    pub cause: Option<String>,
}

/// Cursor-based bounded history. A gap is explicit; terminal status is also
/// retained independently of this log, until the next prepare request.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingEvents {
    pub events: Vec<RecordingEvent>,
    pub missed: u64,
    pub cursor: u64,
    pub status: RecordingStatus,
}

#[derive(Debug)]
pub struct NativeSources {
    pub screens: Result<Vec<beam_screen::model::SourceDescriptor>, String>,
    pub cameras: Result<Vec<beam_camera::CameraDevice>, String>,
    pub microphones: Result<Vec<beam_audio::AudioDevice>, String>,
    pub system_outputs: Result<Vec<beam_audio::AudioDevice>, String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StillConfig {
    pub project_id: ProjectId,
    pub screen: beam_screen::model::ScreenSelection,
    pub region: Option<beam_screen::model::ScreenRegion>,
    #[serde(default)]
    pub excluded_window_handles: Vec<String>,
}
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StillResult {
    pub project_id: ProjectId,
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OutputLocation {
    #[default]
    ProjectRoot,
    Studio,
    Instant,
}

/// Backend support; discovery and preparation report device/permission availability.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaCapabilities {
    #[serde(flatten)]
    pub screen: beam_screen::model::CaptureCapabilities,
    pub camera_capture: bool,
    pub microphone_capture: bool,
    pub system_audio_capture: bool,
    pub pause_resume: bool,
    pub screenshots: bool,
}

/// Camera/audio access may only be resolved when the OS opens the selected device.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPermissions {
    #[serde(flatten)]
    pub screen: beam_screen::model::PermissionSnapshot,
    pub camera: beam_media_manifest::PermissionState,
    pub microphone: beam_media_manifest::PermissionState,
    pub system_audio: beam_media_manifest::PermissionState,
}
