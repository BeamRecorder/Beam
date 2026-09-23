use crate::{AudioSelection, CameraSelection, EngineError, RecordingConfig};
use beam_media_manifest::{ProjectId, SessionId};
use std::path::{Path, PathBuf};

pub(crate) fn validate(config: &RecordingConfig) -> Result<(), EngineError> {
    let invalid = |message: &str| EngineError::InvalidConfiguration(message.into());
    if config.screen.is_none()
        && config.camera == CameraSelection::Disabled
        && config.microphone == AudioSelection::Disabled
        && config.system_audio == AudioSelection::Disabled
    {
        return Err(invalid("select at least one source"));
    }
    if let Some(screen) = &config.screen {
        if screen.fps == 0 || screen.fps > 240 {
            return Err(invalid("screen fps must be 1–240"));
        }
        if let Some(region) = screen.region {
            region
                .validate()
                .map_err(|error| invalid(&error.to_string()))?;
        }
    }
    let valid_id = |id: &str| !id.trim().is_empty() && id.len() <= 1024 && !id.contains('\0');
    let format = match &config.camera {
        CameraSelection::Disabled => None,
        CameraSelection::FirstAvailable { width, height, fps } => Some((*width, *height, *fps)),
        CameraSelection::Device(request) => {
            if !valid_id(&request.device_id) {
                return Err(invalid("invalid camera identifier"));
            }
            Some((request.width, request.height, request.fps))
        }
    };
    if let Some((width, height, fps)) = format
        && (width == 0 || height == 0 || fps == 0 || width > 16384 || height > 16384 || fps > 240)
    {
        return Err(invalid(
            "camera format must be 1–16384 pixels and 1–240 fps",
        ));
    }
    for source in [&config.microphone, &config.system_audio] {
        if let AudioSelection::Device(id) = source
            && !valid_id(id)
        {
            return Err(invalid("invalid audio identifier"));
        }
    }
    Ok(())
}

pub(crate) fn root(path: &Path) -> Result<PathBuf, EngineError> {
    if path.as_os_str().is_empty() {
        return Err(EngineError::InvalidConfiguration(
            "empty projects root".into(),
        ));
    }
    std::fs::create_dir_all(path)?;
    Ok(path.canonicalize()?)
}

pub(crate) fn managed_root(root: &Path, name: &str) -> Result<PathBuf, EngineError> {
    let path = root.join(name);
    match std::fs::create_dir(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error.into()),
    }
    let metadata = std::fs::symlink_metadata(&path)?;
    if !metadata.is_dir()
        || metadata.file_type().is_symlink()
        || path.canonicalize()?.parent() != Some(root)
    {
        return Err(EngineError::InvalidConfiguration(
            "output directory escapes the projects root".into(),
        ));
    }
    Ok(path)
}

pub(crate) fn reserve(root: &Path, project: ProjectId) -> Result<PathBuf, EngineError> {
    let directory = crate::project::directory(root, project)?;
    match std::fs::create_dir(&directory) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error.into()),
    }
    let metadata = std::fs::symlink_metadata(&directory)?;
    if !metadata.is_dir()
        || metadata.file_type().is_symlink()
        || directory.canonicalize()?.parent() != Some(root)
    {
        return Err(EngineError::InvalidConfiguration(
            "project directory escapes the projects root".into(),
        ));
    }
    // create_dir (not create_dir_all) refuses collisions; existing sessions are never reused.
    let output = directory.join(SessionId::new().to_string());
    std::fs::create_dir(&output)?;
    Ok(output)
}
