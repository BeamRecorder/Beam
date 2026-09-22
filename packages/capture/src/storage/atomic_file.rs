pub fn write_atomic(path: &std::path::Path, bytes: &[u8]) -> Result<(), crate::CaptureError> {
    beam_media_manifest::write_atomic(path, bytes)?;
    Ok(())
}
