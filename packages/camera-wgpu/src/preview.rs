use beam_camera::CameraFrame;
use beam_media_core::VideoFrame;

use crate::{PreviewError, upload::padded_rgba_rows};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PreviewStats {
    pub frames_uploaded: u64,
    pub texture_recreations: u64,
    pub bytes_uploaded: u64,
    pub cpu_color_conversion_bytes: u64,
    pub cpu_padding_copy_count: u64,
    pub cpu_padding_copy_bytes: u64,
    pub rgba_capacity_bytes: usize,
    pub staging_capacity_bytes: usize,
    pub cpu_buffer_reallocations: u64,
    pub cpu_buffer_growth_bytes: u64,
}

pub struct PreviewFrame<'a> {
    pub view: &'a wgpu::TextureView,
    pub captured_ns: u64,
    pub width: u32,
    pub height: u32,
}

/// Holds one texture and two reusable CPU buffers. A device change recreates
/// the texture; a slow caller never blocks the camera's recording queue.
#[derive(Default)]
pub struct CameraPreview {
    device: Option<wgpu::Device>,
    texture: Option<wgpu::Texture>,
    view: Option<wgpu::TextureView>,
    width: u32,
    height: u32,
    rgba: Vec<u8>,
    staging: Vec<u8>,
    stats: PreviewStats,
}

impl CameraPreview {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn update<'a>(
        &'a mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        frame: &VideoFrame<CameraFrame>,
    ) -> Result<PreviewFrame<'a>, PreviewError> {
        if frame.width == 0
            || frame.height == 0
            || frame.width > device.limits().max_texture_dimension_2d
            || frame.height > device.limits().max_texture_dimension_2d
        {
            return Err(PreviewError::TextureTooLarge);
        }
        let old_rgba_capacity = self.rgba.capacity();
        let old_staging_capacity = self.staging.capacity();
        frame.data.write_rgba(&mut self.rgba)?;
        let (upload, row_pitch) =
            padded_rgba_rows(&self.rgba, frame.width, frame.height, &mut self.staging)?;
        let rgba_len = self.rgba.len();
        if self.device.as_ref() != Some(device)
            || self.width != frame.width
            || self.height != frame.height
            || self.texture.is_none()
        {
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("Beam camera preview"),
                size: wgpu::Extent3d {
                    width: frame.width,
                    height: frame.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8UnormSrgb,
                usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            });
            let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            self.device = Some(device.clone());
            self.texture = Some(texture);
            self.view = Some(view);
            self.width = frame.width;
            self.height = frame.height;
            self.stats.texture_recreations += 1;
        }
        let texture = self.texture.as_ref().ok_or(PreviewError::TextureTooLarge)?;
        let upload_len = upload.len();
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            upload,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(row_pitch),
                rows_per_image: Some(frame.height),
            },
            wgpu::Extent3d {
                width: frame.width,
                height: frame.height,
                depth_or_array_layers: 1,
            },
        );
        let rgba_growth = self.rgba.capacity().saturating_sub(old_rgba_capacity);
        let staging_growth = self.staging.capacity().saturating_sub(old_staging_capacity);
        self.stats.frames_uploaded += 1;
        self.stats.bytes_uploaded = self
            .stats
            .bytes_uploaded
            .saturating_add(u64::try_from(upload_len).unwrap_or(u64::MAX));
        self.stats.cpu_color_conversion_bytes = self
            .stats
            .cpu_color_conversion_bytes
            .saturating_add(u64::try_from(rgba_len).unwrap_or(u64::MAX));
        if upload_len > rgba_len {
            self.stats.cpu_padding_copy_count = self.stats.cpu_padding_copy_count.saturating_add(1);
            self.stats.cpu_padding_copy_bytes = self
                .stats
                .cpu_padding_copy_bytes
                .saturating_add(u64::try_from(rgba_len).unwrap_or(u64::MAX));
        }
        self.stats.rgba_capacity_bytes = self.rgba.capacity();
        self.stats.staging_capacity_bytes = self.staging.capacity();
        self.stats.cpu_buffer_reallocations = self
            .stats
            .cpu_buffer_reallocations
            .saturating_add(u64::from(rgba_growth > 0) + u64::from(staging_growth > 0));
        self.stats.cpu_buffer_growth_bytes = self.stats.cpu_buffer_growth_bytes.saturating_add(
            u64::try_from(rgba_growth.saturating_add(staging_growth)).unwrap_or(u64::MAX),
        );
        let view = self.view.as_ref().ok_or(PreviewError::TextureTooLarge)?;
        Ok(PreviewFrame {
            view,
            captured_ns: frame.captured_ns,
            width: frame.width,
            height: frame.height,
        })
    }

    pub fn reset(&mut self) {
        self.device = None;
        self.texture = None;
        self.view = None;
        self.width = 0;
        self.height = 0;
    }

    #[must_use]
    pub const fn stats(&self) -> PreviewStats {
        self.stats
    }
}
