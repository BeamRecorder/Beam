use std::path::{Component, Path};
pub fn validate_relative_path(path: &Path) -> Result<(), crate::CaptureError> {
    if path.as_os_str().is_empty()
        || path.is_absolute()
        || path.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(crate::CaptureError::InvalidConfiguration(format!(
            "unsafe relative path: {}",
            path.display()
        )));
    }
    Ok(())
}
