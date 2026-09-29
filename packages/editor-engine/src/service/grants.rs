//! Trusted hosts issue opaque, revocable filesystem capabilities.
use crate::{EditorError, Result};
use std::{
    collections::HashMap,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Project,
    Source,
    Destination,
}
struct Grant {
    path: PathBuf,
    kind: Kind,
}
#[derive(Default)]
pub struct GrantRegistry {
    grants: Mutex<HashMap<String, Grant>>,
}

impl GrantRegistry {
    /// Lists configured capabilities without exposing filesystem paths.
    pub(crate) fn list(&self) -> Vec<beam_editor_domain::protocol::GrantInfo> {
        let grants = self.grants.lock().unwrap_or_else(|p| p.into_inner());
        let mut items: Vec<_> = grants
            .iter()
            .map(|(id, grant)| beam_editor_domain::protocol::GrantInfo {
                id: id.clone(),
                name: grant
                    .path
                    .file_name()
                    .map(|v| v.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "Authorized root".into()),
                kind: match grant.kind {
                    Kind::Project => beam_editor_domain::protocol::GrantKind::Project,
                    Kind::Source => beam_editor_domain::protocol::GrantKind::Source,
                    Kind::Destination => beam_editor_domain::protocol::GrantKind::Destination,
                },
            })
            .collect();
        items.sort_by(|a, b| a.id.cmp(&b.id));
        items
    }
    /// The caller is the trusted OS host/CLI, never renderer JSON.
    pub fn authorize_project(&self, path: &Path) -> Result<String> {
        std::fs::create_dir_all(path).map_err(|e| crate::shared::storage(path, e))?;
        self.authorize(path, Kind::Project)
    }
    pub fn authorize_source(&self, path: &Path) -> Result<String> {
        self.authorize(path, Kind::Source)
    }
    pub fn authorize_destination(&self, path: &Path) -> Result<String> {
        self.authorize(path, Kind::Destination)
    }
    pub fn revoke(&self, id: &str) {
        self.grants
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(id);
    }
    fn authorize(&self, path: &Path, kind: Kind) -> Result<String> {
        let canonical = path
            .canonicalize()
            .map_err(|e| crate::shared::storage(path, e))?;
        if (kind == Kind::Source && !canonical.is_file())
            || (kind != Kind::Source && !canonical.is_dir())
        {
            return Err(EditorError::Invalid(
                "grant has the wrong filesystem kind".into(),
            ));
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.grants
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(
                id.clone(),
                Grant {
                    path: canonical,
                    kind,
                },
            );
        Ok(id)
    }
    fn resolve(&self, id: &str, kind: Kind) -> Result<PathBuf> {
        let grants = self.grants.lock().unwrap_or_else(|p| p.into_inner());
        let grant = grants.get(id).filter(|g| g.kind == kind).ok_or_else(|| {
            EditorError::Unauthorized("missing, revoked or incompatible grant".into())
        })?;
        let current = grant
            .path
            .canonicalize()
            .map_err(|e| crate::shared::storage(&grant.path, e))?;
        if current != grant.path {
            return Err(EditorError::Unauthorized(
                "grant root was replaced by a symlink".into(),
            ));
        }
        Ok(current)
    }
    pub(crate) fn project(&self, id: &str) -> Result<PathBuf> {
        self.resolve(id, Kind::Project)
    }
    pub(crate) fn source(&self, id: &str) -> Result<PathBuf> {
        self.resolve(id, Kind::Source)
    }
    /// Resolution precedes idempotency lookup; a completed retry may already own this file.
    pub(crate) fn destination_path(&self, id: &str, name: &str) -> Result<PathBuf> {
        if name.is_empty()
            || name.len() > 255
            || name.contains(['\\', ':', '\0'])
            || Path::new(name).components().count() != 1
            || !matches!(
                Path::new(name).components().next(),
                Some(Component::Normal(_))
            )
        {
            return Err(EditorError::Unauthorized(
                "export filename must be a single relative filename".into(),
            ));
        }
        Ok(self.resolve(id, Kind::Destination)?.join(name))
    }
}
