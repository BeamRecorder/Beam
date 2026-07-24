use std::path::{Path, PathBuf};

use crate::model::{ProjectId, SessionId, TrackKind};

#[derive(Debug, Clone)]
pub struct ProjectLayout {
    root: PathBuf,
    project_id: ProjectId,
}
impl ProjectLayout {
    #[must_use]
    pub fn new(root: impl Into<PathBuf>, project_id: ProjectId) -> Self {
        Self {
            root: root.into(),
            project_id,
        }
    }
    #[must_use]
    pub fn project_dir(&self) -> PathBuf {
        if let Ok(entries) = std::fs::read_dir(&self.root) {
            for entry in entries.flatten() {
                let candidate = entry.path();
                let manifest = candidate.join("project.json");
                let Ok(contents) = std::fs::read(&manifest) else {
                    continue;
                };
                let Ok(value) = serde_json::from_slice::<crate::model::ProjectManifest>(&contents)
                else {
                    continue;
                };
                if value.project_id == self.project_id {
                    return candidate;
                }
            }
        }
        self.root.join(format!("project-{}", self.project_id))
    }
    #[must_use]
    pub fn project_manifest(&self) -> PathBuf {
        self.project_dir().join("project.json")
    }
    #[must_use]
    pub fn session(&self, id: SessionId) -> SessionLayout {
        SessionLayout {
            root: self.project_dir().join(format!("session-{id}")),
        }
    }
}

#[derive(Debug, Clone)]
pub struct SessionLayout {
    root: PathBuf,
}
impl SessionLayout {
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }
    #[must_use]
    pub fn manifest(&self) -> PathBuf {
        self.root.join("manifest.json")
    }
    #[must_use]
    pub fn partial_manifest(&self) -> PathBuf {
        self.root.join("manifest.partial.json")
    }
    #[must_use]
    pub fn health(&self) -> PathBuf {
        self.root.join("health.jsonl")
    }
    #[must_use]
    pub fn timing(&self) -> PathBuf {
        self.root.join("timing.jsonl")
    }
    #[must_use]
    pub fn track_dir(&self, kind: TrackKind) -> PathBuf {
        self.root.join(match kind {
            TrackKind::Screen => "screen",
            TrackKind::SystemAudio => "system-audio",
            TrackKind::Microphone => "microphone",
            TrackKind::Camera => "camera",
            TrackKind::Cursor => "cursor",
        })
    }
    pub fn create(&self) -> Result<(), crate::CaptureError> {
        std::fs::create_dir_all(&self.root)
            .map_err(|e| crate::CaptureError::storage(&self.root, e))?;
        for kind in [
            TrackKind::Screen,
            TrackKind::SystemAudio,
            TrackKind::Microphone,
            TrackKind::Camera,
            TrackKind::Cursor,
        ] {
            let path = self.track_dir(kind);
            std::fs::create_dir_all(&path).map_err(|e| crate::CaptureError::storage(&path, e))?;
        }
        Ok(())
    }
}
