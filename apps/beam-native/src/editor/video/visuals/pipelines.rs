//! One pair of Blick GPU pipelines shared by all clip canvases on the device.
use super::types::Pipelines;
use argui_render::{GpuCanvasDeviceContext, wgpu};
use std::sync::Arc;

fn buffer(
    binding: u32,
    visibility: wgpu::ShaderStages,
    ty: wgpu::BufferBindingType,
) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility,
        ty: wgpu::BindingType::Buffer {
            ty,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}
pub(super) fn create(context: &GpuCanvasDeviceContext<'_>) -> Arc<Pipelines> {
    let device = context.device();
    let analysis_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("blick-analysis"),
        entries: &[
            buffer(
                0,
                wgpu::ShaderStages::COMPUTE,
                wgpu::BufferBindingType::Storage { read_only: true },
            ),
            buffer(
                1,
                wgpu::ShaderStages::COMPUTE,
                wgpu::BufferBindingType::Storage { read_only: false },
            ),
            buffer(
                2,
                wgpu::ShaderStages::COMPUTE,
                wgpu::BufferBindingType::Uniform,
            ),
        ],
    });
    let render_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("blick-strips"),
        entries: &[
            buffer(
                0,
                wgpu::ShaderStages::VERTEX,
                wgpu::BufferBindingType::Storage { read_only: true },
            ),
            buffer(
                1,
                wgpu::ShaderStages::VERTEX,
                wgpu::BufferBindingType::Uniform,
            ),
        ],
    });
    let compute_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("blick-analysis"),
        bind_group_layouts: &[Some(&analysis_layout)],
        immediate_size: 0,
    });
    let render_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("blick-strips"),
        bind_group_layouts: &[Some(&render_layout)],
        immediate_size: 0,
    });
    let compute_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("blick-analysis"),
        source: wgpu::ShaderSource::Wgsl(include_str!("blick.wgsl").into()),
    });
    let render_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("blick-strips"),
        source: wgpu::ShaderSource::Wgsl(include_str!("strips.wgsl").into()),
    });
    let compute = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("blick-analysis"),
        layout: Some(&compute_layout),
        module: &compute_shader,
        entry_point: Some("analysis"),
        compilation_options: Default::default(),
        cache: None,
    });
    let render = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("blick-strips"),
        layout: Some(&render_pipeline_layout),
        vertex: wgpu::VertexState {
            module: &render_shader,
            entry_point: Some("vertex"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &render_shader,
            entry_point: Some("fragment"),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: context.target_format(),
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleStrip,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: Default::default(),
        multiview_mask: None,
        cache: None,
    });
    Arc::new(Pipelines {
        generation: context.device_generation(),
        format: context.target_format(),
        compute,
        render,
        analysis_layout,
        render_layout,
    })
}
