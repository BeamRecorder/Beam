//! Draws GStreamer's bounded frame into Argui's device without a second surface.
pub(super) use super::types::Factory;
use super::types::{Renderer, Texture};
use argui_render::{
    GpuCanvasDeviceContext, GpuCanvasError, GpuCanvasFactory, GpuCanvasMailbox,
    GpuCanvasRenderContext, GpuCanvasRenderer, GpuCanvasRequirements, wgpu,
};
use beam_editor_engine::PreviewFrame;

impl Factory {
    /// Creates a registration which negotiates each actual device generation once.
    pub fn new(
        mailbox: GpuCanvasMailbox<PreviewFrame>,
        controller: Option<std::sync::Arc<beam_editor_engine::EditorController>>,
    ) -> Self {
        Self {
            mailbox,
            controller,
            generation: std::sync::atomic::AtomicU64::new(0),
            resources: Default::default(),
            cover: false,
            source: None,
        }
    }
}
impl GpuCanvasFactory for Factory {
    fn requirements(&self) -> GpuCanvasRequirements {
        argui_render::ExternalFrame::requirements()
    }
    fn device_ready(&self, context: &GpuCanvasDeviceContext<'_>) {
        use std::sync::atomic::Ordering;
        if self
            .generation
            .swap(context.device_generation(), Ordering::AcqRel)
            == context.device_generation()
        {
            return;
        }
        if let Some(controller) = &self.controller {
            use beam_editor_engine::video::gpu::types::PreviewTransport;
            #[cfg(target_os = "linux")]
            let transport = match context.external_frame_transport() {
                argui_render::ExternalFrameTransport::DmaBuf => PreviewTransport::DmaBuf,
                _ => PreviewTransport::Rgba,
            };
            #[cfg(not(target_os = "linux"))]
            let transport = PreviewTransport::Rgba;
            controller.set_preview_transport(transport);
            let _ = controller.retry();
        }
    }
    fn create(
        &self,
        context: &GpuCanvasDeviceContext<'_>,
    ) -> Result<Box<dyn GpuCanvasRenderer>, GpuCanvasError> {
        let mut cache = self.resources.lock().unwrap_or_else(|p| p.into_inner());
        if cache.as_ref().is_none_or(|r| {
            r.generation != context.device_generation() || r.format != context.target_format()
        }) {
            *cache = Some(super::resources::create(context));
        }
        let resources = cache.as_ref().expect("preview resources");
        let device = context.device();
        Ok(Box::new(Renderer {
            mailbox: self.mailbox.clone(),
            pipeline: resources.pipeline.clone(),
            layout: resources.layout.clone(),
            sampler: resources.sampler.clone(),
            uniform: device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("beam-preview-fit"),
                size: 16,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }),
            texture: None,
            cover: self.cover,
            source: self.source.clone(),
            seen_source: None,
        }))
    }
}
impl Renderer {
    fn upload(
        &mut self,
        context: &mut GpuCanvasRenderContext<'_>,
        frame: &PreviewFrame,
    ) -> Result<(), GpuCanvasError> {
        let size = [frame.width, frame.height];
        if frame.width == 0
            || frame.height == 0
            || frame.width > 4096
            || frame.height > 4096
            || (frame.external.is_none()
                && frame.rgba.len() != frame.width as usize * frame.height as usize * 4)
        {
            return Err(GpuCanvasError::new("invalid GStreamer preview dimensions"));
        }
        if let Some(external) = frame.external.clone() {
            let imported = super::external::import(context, size, external)?;
            let image = imported.texture(context).clone();
            self.texture = Some(self.bind(context.device(), image, size, Some(imported)));
            return Ok(());
        }
        if self
            .texture
            .as_ref()
            .is_none_or(|texture| texture.size != size || texture.external.is_some())
        {
            let image = context.device().create_texture(&wgpu::TextureDescriptor {
                label: Some("beam-preview-frame"),
                size: wgpu::Extent3d {
                    width: size[0],
                    height: size[1],
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8UnormSrgb,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            });
            self.texture = Some(self.bind(context.device(), image, size, None));
        }
        let texture = self
            .texture
            .as_ref()
            .ok_or_else(|| GpuCanvasError::new("missing preview texture"))?;
        context.queue().write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture.image,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &frame.rgba,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(size[0] * 4),
                rows_per_image: Some(size[1]),
            },
            wgpu::Extent3d {
                width: size[0],
                height: size[1],
                depth_or_array_layers: 1,
            },
        );
        Ok(())
    }
    fn bind(
        &self,
        device: &wgpu::Device,
        image: wgpu::Texture,
        size: [u32; 2],
        external: Option<argui_render::ImportedExternalFrame>,
    ) -> Texture {
        let view = image.create_view(&Default::default());
        let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("beam-preview-frame-group"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.uniform.as_entire_binding(),
                },
            ],
        });
        Texture {
            image,
            group,
            size,
            external,
        }
    }
}
impl GpuCanvasRenderer for Renderer {
    fn render(&mut self, context: &mut GpuCanvasRenderContext<'_>) -> Result<(), GpuCanvasError> {
        if let Some(source) = &self.source {
            let frame = source.lock().unwrap_or_else(|p| p.into_inner()).clone();
            if let Some(frame) = frame {
                if self
                    .seen_source
                    .as_ref()
                    .is_none_or(|seen| !std::sync::Arc::ptr_eq(seen, &frame))
                {
                    self.upload(context, &frame)?;
                    self.seen_source = Some(frame);
                }
            } else {
                self.texture = None;
                self.seen_source = None;
            }
            self.mailbox.clear();
        } else if let Some(frame) = self.mailbox.take() {
            self.upload(context, &frame)?;
        }
        let Some(texture) = &self.texture else {
            return Ok(());
        };
        if let Some(external) = &texture.external {
            external.retain(context);
        }
        let extent = context.physical_extent();
        let source = texture.size[0] as f32 / texture.size[1] as f32;
        let target = extent[0] as f32 / extent[1].max(1) as f32;
        let scale = if self.cover {
            if source > target {
                [source / target, 1., 0., 0.]
            } else {
                [1., target / source, 0., 0.]
            }
        } else if source > target {
            [1., target / source, 0., 0.]
        } else {
            [source / target, 1., 0., 0.]
        };
        let bytes: Vec<_> = scale.into_iter().flat_map(f32::to_ne_bytes).collect();
        context.queue().write_buffer(&self.uniform, 0, &bytes);
        let (encoder, target) = context.encoder_and_target();
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("beam-preview-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                },
            })],
            ..Default::default()
        });
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, &texture.group, &[]);
        pass.draw(0..3, 0..1);
        Ok(())
    }
}
