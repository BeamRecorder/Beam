//! Typed update feed and UI snapshots; package metadata is frozen at check time.

use argui_updater::{InstallOutcome, State};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Mutex;

pub(super) enum Action {
    Check,
    Download,
    Install,
}
pub(super) struct UpdateSession {
    pub version: String,
    pub engine: Mutex<Option<argui_updater::Updater<GitHubBackend>>>,
    pub snapshot: Mutex<Snapshot>,
    pub cancellation: Mutex<Option<argui_updater::CancellationToken>>,
}

pub(super) struct GitHubBackend {
    pub current: semver::Version,
    pub client: reqwest::blocking::Client,
    pub installer: argui_updater::install::NativeInstaller,
    pub target: String,
}

/// Opaque to the UI; the backend only returns it after checking complete bytes.
pub(super) struct VerifiedPackage(pub(super) tempfile::NamedTempFile);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Feed {
    pub schema_version: u32,
    pub version: semver::Version,
    #[serde(default)]
    pub notes: String,
    pub platforms: BTreeMap<String, Artifact>,
}

#[cfg(test)]
#[path = "../../../test/beam/updater/types.rs"]
mod tests;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Artifact {
    pub url: String,
    pub sha256: String,
    pub size: u64,
    pub format: argui_updater::install::Format,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Snapshot {
    pub phase: &'static str,
    pub version: Option<String>,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percent: Option<f32>,
    pub error: Option<String>,
    pub restart_required: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdateEvent<'a> {
    pub r#type: &'static str,
    pub update: &'a Snapshot,
}

impl Snapshot {
    /// Maps every engine transition into the stable Solid service schema.
    pub(super) fn from_state(state: &State) -> Self {
        let progress = match state {
            State::Downloading { progress, .. } => *progress,
            _ => argui_updater::Progress::default(),
        };
        Self {
            phase: match state {
                State::Idle => "idle",
                State::Checking => "checking",
                State::UpToDate => "upToDate",
                State::Available(_) => "available",
                State::Downloading { .. } => "downloading",
                State::Verifying(_) => "verifying",
                State::Ready(_) => "ready",
                State::Installing(_) => "installing",
                State::Installed { .. } => "installed",
                State::Cancelled(_) => "cancelled",
                State::Failed(_) => "failed",
            },
            version: state.release().map(|release| release.version.clone()),
            downloaded: progress.downloaded,
            total: progress.total,
            percent: progress.percent(),
            error: match state {
                State::Failed(error) => Some(error.clone()),
                _ => None,
            },
            restart_required: matches!(
                state,
                State::Installed {
                    outcome: InstallOutcome::RestartRequired,
                    ..
                }
            ),
        }
    }
}
