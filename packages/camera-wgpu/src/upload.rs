#[derive(Debug, thiserror::Error)]
pub enum PreviewError {
    #[error("invalid camera frame: {0}")]
    Camera(#[from] beam_camera::CameraError),
    #[error("camera frame exceeds the device's maximum texture size")]
    TextureTooLarge,
    #[error("RGBA row byte count overflows")]
    RowOverflow,
    #[error("GPU preview failed: {0}")]
    Gpu(String),
}

pub fn aligned_rgba_row_bytes(width: u32) -> Result<usize, PreviewError> {
    let bytes = usize::try_from(width)
        .ok()
        .and_then(|width| width.checked_mul(4))
        .ok_or(PreviewError::RowOverflow)?;
    let alignment = usize::try_from(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT)
        .map_err(|_| PreviewError::RowOverflow)?;
    let aligned = bytes
        .checked_add(alignment - 1)
        .map(|value| value / alignment * alignment)
        .ok_or(PreviewError::RowOverflow)?;
    u32::try_from(aligned).map_err(|_| PreviewError::RowOverflow)?;
    Ok(aligned)
}

pub(crate) fn padded_rgba_rows<'a>(
    rgba: &'a [u8],
    width: u32,
    height: u32,
    scratch: &'a mut Vec<u8>,
) -> Result<(&'a [u8], u32), PreviewError> {
    let row_bytes = usize::try_from(width)
        .ok()
        .and_then(|width| width.checked_mul(4))
        .ok_or(PreviewError::RowOverflow)?;
    let row_pitch = aligned_rgba_row_bytes(width)?;
    let rows = usize::try_from(height).map_err(|_| PreviewError::RowOverflow)?;
    if row_pitch == row_bytes {
        return Ok((
            rgba,
            u32::try_from(row_pitch).map_err(|_| PreviewError::RowOverflow)?,
        ));
    }
    let length = row_pitch
        .checked_mul(rows)
        .ok_or(PreviewError::RowOverflow)?;
    scratch.resize(length, 0);
    for (source, destination) in rgba
        .chunks_exact(row_bytes)
        .zip(scratch.chunks_exact_mut(row_pitch))
    {
        destination[..row_bytes].copy_from_slice(source);
    }
    Ok((
        scratch,
        u32::try_from(row_pitch).map_err(|_| PreviewError::RowOverflow)?,
    ))
}
