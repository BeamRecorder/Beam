//! Managed sources are content identified before persistence and checked before decoding.
use super::source_types::SourceStamp;
use crate::{EditorError, MediaAsset, Project, Result};
use beam_editor_domain::project::types::SourceIdentity;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
type SourceCache = Mutex<HashMap<PathBuf, (SourceStamp, SourceIdentity)>>;
static VERIFIED: OnceLock<SourceCache> = OnceLock::new();

pub fn identity(path: &Path) -> Result<SourceIdentity> {
    let version = crate::service::artifacts::version(path)?;
    Ok(SourceIdentity {
        sha256: version.sha256,
        byte_length: version.byte_length,
    })
}
/// Legacy imports receive the digest of their actual file, never a synthetic identity.
pub fn hydrate(root: &Path, project: &mut Project) -> Result<()> {
    for asset in &mut project.assets {
        if asset.identity.is_none() {
            let path = crate::project::validation::source_path(root, &asset.path)?;
            asset.identity = Some(identity(&path)?);
        }
    }
    super::cursor_migration::hydrate(root, project)?;
    Ok(())
}
pub fn verify(root: &Path, asset: &MediaAsset) -> Result<()> {
    let Some(expected) = &asset.identity else {
        // Pure in-memory legacy fixtures may have no identity; persisted V2 never does.
        return Ok(());
    };
    expected.validate()?;
    let path = crate::project::validation::source_path(root, &asset.path)?;
    let stamp = stamp(&path)?;
    let cache = VERIFIED.get_or_init(Default::default);
    if cache
        .lock()
        .map_err(|_| EditorError::Stopped)?
        .get(&path)
        .is_some_and(|(previous, identity)| previous == &stamp && identity == expected)
    {
        return Ok(());
    }
    let actual = identity(&path)?;
    if &actual != expected {
        return Err(EditorError::Invalid(format!(
            "source bytes changed: {}",
            asset.name
        )));
    }
    let mut entries = cache.lock().map_err(|_| EditorError::Stopped)?;
    if entries.len() >= 1024 {
        entries.clear();
    }
    entries.insert(path, (stamp, actual));
    Ok(())
}
fn stamp(path: &Path) -> Result<SourceStamp> {
    let metadata = fs::metadata(path).map_err(|error| crate::shared::storage(path, error))?;
    Ok(SourceStamp::from(&metadata))
}
