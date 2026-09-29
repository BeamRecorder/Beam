//! Retained viewport resources, owned by Argui's WGPU device.
use argui_render::{GpuCanvasMailbox, wgpu};
use beam_editor_engine::PreviewFrame;

pub(super) struct Factory {
    pub mailbox: GpuCanvasMailbox<PreviewFrame>,
    pub controller: Option<std::sync::Arc<beam_editor_engine::EditorController>>,
    pub generation: std::sync::atomic::AtomicU64,
    pub resources: ResourceCache,
    pub cover: bool,
    pub source: Option<SourceFrame>,
}

pub(super) struct Texture {
    pub image: wgpu::Texture,
    pub group: wgpu::BindGroup,
    pub size: [u32; 2],
    pub external: Option<argui_render::ImportedExternalFrame>,
}
pub(super) struct Renderer {
    pub mailbox: GpuCanvasMailbox<PreviewFrame>,
    pub pipeline: wgpu::RenderPipeline,
    pub layout: wgpu::BindGroupLayout,
    pub sampler: wgpu::Sampler,
    pub uniform: wgpu::Buffer,
    pub texture: Option<Texture>,
    pub cover: bool,
    pub source: Option<SourceFrame>,
    pub seen_source: Option<std::sync::Arc<PreviewFrame>>,
}

pub(super) type SourceFrame =
    std::sync::Arc<std::sync::Mutex<Option<std::sync::Arc<PreviewFrame>>>>;

pub(super) type ResourceCache = std::sync::Arc<std::sync::Mutex<Option<Resources>>>;
pub(super) struct Resources {
    pub generation: u64,
    pub format: wgpu::TextureFormat,
    pub pipeline: wgpu::RenderPipeline,
    pub layout: wgpu::BindGroupLayout,
    pub sampler: wgpu::Sampler,
}
