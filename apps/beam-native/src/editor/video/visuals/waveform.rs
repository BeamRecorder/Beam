//! Data/size-driven native Blick rendering; no idle redraws or JavaScript pixels.
use super::pipelines;
use argui_render::{
    GpuCanvasDeviceContext, GpuCanvasError, GpuCanvasFactory, GpuCanvasRenderContext,
    GpuCanvasRenderer, wgpu,
};
use std::sync::Arc;

pub(super) use super::types::WaveformFactory as Factory;
use super::types::WaveformRenderer as Renderer;

impl GpuCanvasFactory for Factory {
    fn create(
        &self,
        context: &GpuCanvasDeviceContext<'_>,
    ) -> Result<Box<dyn GpuCanvasRenderer>, GpuCanvasError> {
        let mut cached = self.pipelines.lock().unwrap_or_else(|p| p.into_inner());
        if cached.as_ref().is_none_or(|p| {
            p.generation != context.device_generation() || p.format != context.target_format()
        }) {
            *cached = Some(pipelines::create(context));
        }
        let pipelines = Arc::clone(cached.as_ref().expect("Blick pipelines"));
        let device = context.device();
        let input = buffer(device, "blick-data", 2048 * 32, wgpu::BufferUsages::STORAGE);
        let output = buffer(
            device,
            "blick-envelopes",
            4097 * 16,
            wgpu::BufferUsages::STORAGE,
        );
        let uniform = buffer(device, "blick-params", 16, wgpu::BufferUsages::UNIFORM);
        let analysis = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("blick-analysis"),
            layout: &pipelines.analysis_layout,
            entries: &[
                binding(0, &input),
                binding(1, &output),
                binding(2, &uniform),
            ],
        });
        let strips = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("blick-strips"),
            layout: &pipelines.render_layout,
            entries: &[binding(0, &output), binding(1, &uniform)],
        });
        Ok(Box::new(Renderer {
            mailbox: self.mailbox.clone(),
            pipelines,
            input,
            output,
            uniform,
            analysis,
            strips,
            data: None,
            columns: 0,
        }))
    }
}
fn buffer(
    device: &wgpu::Device,
    label: &str,
    size: u64,
    usage: wgpu::BufferUsages,
) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some(label),
        size,
        usage: usage | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}
fn binding(binding: u32, buffer: &wgpu::Buffer) -> wgpu::BindGroupEntry<'_> {
    wgpu::BindGroupEntry {
        binding,
        resource: buffer.as_entire_binding(),
    }
}
impl GpuCanvasRenderer for Renderer {
    fn render(&mut self, context: &mut GpuCanvasRenderContext<'_>) -> Result<(), GpuCanvasError> {
        let incoming = self.mailbox.take();
        let changed = incoming.is_some();
        if let Some(data) = incoming {
            if data.points.is_empty()
                || data.points.len() > 2048
                || data.points.len() != data.ready.len()
                || data.duration_ms == 0
            {
                return Err(GpuCanvasError::new("invalid waveform slice"));
            }
            let bytes: Vec<_> = data
                .points
                .iter()
                .zip(&data.ready)
                .flat_map(|(point, ready)| {
                    [
                        point[0],
                        0.,
                        0.,
                        if *ready { 1. } else { 0. },
                        point[1],
                        point[2],
                        point[3],
                        point[4],
                    ]
                })
                .flat_map(f32::to_ne_bytes)
                .collect();
            context.queue().write_buffer(&self.input, 0, &bytes);
            self.data = Some(data);
        }
        let Some(data) = &self.data else {
            return Ok(());
        };
        let columns = context.physical_extent()[0].clamp(1, 4096);
        if changed || columns != self.columns {
            self.columns = columns;
            let mut bytes = Vec::with_capacity(16);
            bytes.extend((data.points.len() as u32).to_ne_bytes());
            bytes.extend(columns.to_ne_bytes());
            bytes.extend((columns as f32).to_ne_bytes());
            bytes.extend((data.duration_ms as f32 / 1000.).to_ne_bytes());
            context.queue().write_buffer(&self.uniform, 0, &bytes);
            let (encoder, _) = context.encoder_and_target();
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("blick-envelope"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipelines.compute);
            pass.set_bind_group(0, &self.analysis, &[]);
            pass.dispatch_workgroups((columns + 1).div_ceil(64), 1, 1);
        }
        let (encoder, target) = context.encoder_and_target();
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("blick-strips"),
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
        pass.set_pipeline(&self.pipelines.render);
        pass.set_bind_group(0, &self.strips, &[]);
        pass.draw(0..(columns + 1) * 2, 0..4);
        // Keep the compute output alive with the renderer between native redraws.
        let _ = &self.output;
        Ok(())
    }
}
