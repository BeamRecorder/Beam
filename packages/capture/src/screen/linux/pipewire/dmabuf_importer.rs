use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    os::fd::{BorrowedFd, RawFd},
    path::PathBuf,
};

use gbm::{BufferObject, BufferObjectFlags, Device, Format, Modifier};
use pipewire::spa::buffer::Data;

use crate::{CaptureError, NativeCaptureErrorCode};

use super::{NativePixelFormat, NegotiatedFormat};

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct DmaBufPlaneKey {
    fd: RawFd,
    data_type: u32,
    flags: u32,
    map_offset: u32,
    max_size: u32,
    chunk_offset: u32,
    chunk_size: u32,
    chunk_stride: i32,
    chunk_flags: i32,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct DmaBufKey {
    planes: Vec<DmaBufPlaneKey>,
    format: NegotiatedFormat,
}

pub(super) struct DmaBufImporter {
    device: Option<Device<File>>,
    buffers: HashMap<DmaBufKey, BufferObject<()>>,
}

impl DmaBufImporter {
    pub(super) fn new() -> Self {
        Self {
            device: None,
            buffers: HashMap::new(),
        }
    }

    pub(super) fn with_mapping<T>(
        &mut self,
        planes: &[Data],
        format: NegotiatedFormat,
        operation: impl FnOnce(&[u8], i32) -> Result<T, CaptureError>,
    ) -> Result<Result<T, CaptureError>, CaptureError> {
        let key = DmaBufKey::new(planes, format);
        if !self.buffers.contains_key(&key) {
            let buffer = self.import(planes, format)?;
            self.buffers.insert(key.clone(), buffer);
        }
        let buffer = self
            .buffers
            .get(&key)
            .ok_or_else(|| memory_error("imported DMA-BUF disappeared"))?;
        buffer
            .map(0, 0, format.width, format.height, |mapped| {
                let stride = i32::try_from(mapped.stride())
                    .map_err(|_| memory_error("mapped DMA-BUF stride exceeds PipeWire limits"))?;
                Ok(operation(mapped.buffer(), stride))
            })
            .map_err(|error| memory_error(format!("failed to map DMA-BUF: {error}")))?
    }

    pub(super) fn clear(&mut self) {
        self.buffers.clear();
    }

    fn import(
        &mut self,
        planes: &[Data],
        format: NegotiatedFormat,
    ) -> Result<BufferObject<()>, CaptureError> {
        let modifier = Modifier::from(
            format
                .modifier
                .ok_or_else(|| memory_error("missing negotiated DMA-BUF modifier"))?,
        );
        let drm_format = drm_format(format.pixel_format);
        if let Some(device) = &self.device {
            return import_buffer(device, planes, format, drm_format, modifier);
        }
        let mut paths = render_nodes()?;
        paths.sort();
        let mut failures = Vec::new();
        for path in paths {
            let result = OpenOptions::new()
                .read(true)
                .write(true)
                .open(&path)
                .map_err(|error| error.to_string())
                .and_then(|file| Device::new(file).map_err(|error| error.to_string()))
                .and_then(|device| {
                    import_buffer(&device, planes, format, drm_format, modifier)
                        .map(|buffer| (device, buffer))
                        .map_err(|error| error.to_string())
                });
            match result {
                Ok((device, buffer)) => {
                    self.device = Some(device);
                    return Ok(buffer);
                }
                Err(error) => failures.push(format!("{}: {error}", path.display())),
            }
        }
        Err(memory_error(format!(
            "no DRM render node can import modifier {modifier:?}: {}",
            failures.join("; ")
        )))
    }
}

impl DmaBufKey {
    fn new(planes: &[Data], format: NegotiatedFormat) -> Self {
        Self {
            planes: planes
                .iter()
                .map(|plane| {
                    let data = plane.as_raw();
                    let chunk = plane.chunk();
                    DmaBufPlaneKey {
                        fd: plane.fd(),
                        data_type: plane.type_().as_raw(),
                        flags: plane.flags().bits(),
                        map_offset: data.mapoffset,
                        max_size: data.maxsize,
                        chunk_offset: chunk.offset(),
                        chunk_size: chunk.size(),
                        chunk_stride: chunk.stride(),
                        chunk_flags: chunk.flags().bits(),
                    }
                })
                .collect(),
            format,
        }
    }
}

fn import_buffer(
    device: &Device<File>,
    planes: &[Data],
    format: NegotiatedFormat,
    drm_format: Format,
    modifier: Modifier,
) -> Result<BufferObject<()>, CaptureError> {
    let mut buffers = [None; 4];
    let mut strides = [0; 4];
    let mut offsets = [0; 4];
    for (index, plane) in planes.iter().enumerate() {
        let chunk = plane.chunk();
        buffers[index] = Some(unsafe { BorrowedFd::borrow_raw(plane.fd()) });
        strides[index] = chunk.stride();
        offsets[index] = i32::try_from(chunk.offset())
            .map_err(|_| memory_error("DMA-BUF plane offset exceeds GBM limits"))?;
    }
    device
        .import_buffer_object_from_dma_buf_with_modifiers(
            u32::try_from(planes.len()).map_err(memory_error)?,
            buffers,
            format.width,
            format.height,
            drm_format,
            BufferObjectFlags::empty(),
            strides,
            offsets,
            modifier,
        )
        .map_err(memory_error)
}

fn render_nodes() -> Result<Vec<PathBuf>, CaptureError> {
    let entries = fs::read_dir("/dev/dri").map_err(memory_error)?;
    Ok(entries
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("renderD"))
        })
        .collect())
}

fn drm_format(format: NativePixelFormat) -> Format {
    match format {
        NativePixelFormat::Bgrx => Format::Xrgb8888,
        NativePixelFormat::Bgra => Format::Argb8888,
        NativePixelFormat::Rgbx => Format::Xbgr8888,
        NativePixelFormat::Rgba => Format::Abgr8888,
    }
}

fn memory_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::native(
        NativeCaptureErrorCode::PipewireMemoryUnsupported,
        error.to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_pipewire_pixel_formats_to_drm_fourcc() {
        assert_eq!(drm_format(NativePixelFormat::Bgrx), Format::Xrgb8888);
        assert_eq!(drm_format(NativePixelFormat::Bgra), Format::Argb8888);
        assert_eq!(drm_format(NativePixelFormat::Rgbx), Format::Xbgr8888);
        assert_eq!(drm_format(NativePixelFormat::Rgba), Format::Abgr8888);
    }
}
