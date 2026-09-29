//! Typed leases and bounded native media resources.
use argui_render::{GpuCanvasMailbox, GpuCanvasRegistration, wgpu};
use beam_editor_engine::{
    PreviewFrame,
    video::visuals::types::{Cancel, Visual, VisualRequest, Waveform},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, atomic::AtomicBool},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Acquire {
    pub project_id: String,
    pub asset_id: String,
    pub request: VisualRequest,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Release {
    pub key: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Reply {
    pub key: String,
    pub canvas_id: u64,
    pub status: Status,
    pub error: Option<String>,
}
#[derive(Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub(super) enum Status {
    Loading,
    Ready,
    Failed,
}
#[derive(Clone)]
pub(super) enum Target {
    Video {
        mailbox: GpuCanvasMailbox<PreviewFrame>,
        latest: super::super::types::SourceFrame,
    },
    Audio {
        mailbox: GpuCanvasMailbox<Waveform>,
        latest: SourceWaveform,
    },
}
impl Target {
    pub fn publish(&self, visual: &Visual) {
        match (self, visual) {
            (Self::Video { mailbox, latest }, Visual::Video(frame)) => {
                *latest.lock().unwrap_or_else(|p| p.into_inner()) = Some(Arc::new(frame.clone()));
                mailbox.publish(frame.clone());
            }
            (Self::Audio { mailbox, latest }, Visual::Audio(data)) => {
                *latest.lock().unwrap_or_else(|p| p.into_inner()) = Some(Arc::new(data.clone()));
                mailbox.publish(data.clone());
            }
            _ => {}
        }
    }
    pub fn clear(&self) {
        match self {
            Self::Video { mailbox, latest } => {
                mailbox.clear();
                latest.lock().unwrap_or_else(|p| p.into_inner()).take();
            }
            Self::Audio { mailbox, latest } => {
                mailbox.clear();
                latest.lock().unwrap_or_else(|p| p.into_inner()).take();
            }
        }
    }
}
pub(super) struct Entry {
    pub _lease: Option<Lease>,
    pub registration: GpuCanvasRegistration,
    pub target: Target,
    pub cancel: Cancel,
    pub refs: usize,
    pub touched: u64,
    pub last: Option<Visual>,
    pub status: Status,
    pub error: Option<String>,
}
impl Entry {
    pub fn reply(&self, key: &str) -> Reply {
        Reply {
            key: key.into(),
            canvas_id: self.registration.id().get(),
            status: self.status,
            error: self.error.clone(),
        }
    }
}
impl Drop for Entry {
    fn drop(&mut self) {
        self.cancel
            .store(true, std::sync::atomic::Ordering::Release);
    }
}
#[derive(Default)]
pub(super) struct Cache {
    pub entries: HashMap<String, Entry>,
    pub clock: u64,
}
impl Cache {
    pub fn make_room(&mut self) -> Result<(), String> {
        if self.entries.len() < 128 {
            return Ok(());
        }
        let key = self
            .entries
            .iter()
            .filter(|(_, entry)| entry.refs == 0)
            .min_by_key(|(_, entry)| entry.touched)
            .map(|(key, _)| key.clone())
            .ok_or("too many visible source previews")?;
        self.entries.remove(&key);
        Ok(())
    }
    pub fn release(&mut self, key: &str) {
        if let Some(entry) = self.entries.get_mut(key) {
            entry.refs = entry.refs.saturating_sub(1);
            if entry.refs == 0 && entry.status != Status::Ready {
                entry
                    .cancel
                    .store(true, std::sync::atomic::Ordering::Release);
            }
        }
    }
}

pub(super) struct Pipelines {
    pub generation: u64,
    pub format: wgpu::TextureFormat,
    pub compute: wgpu::ComputePipeline,
    pub render: wgpu::RenderPipeline,
    pub analysis_layout: wgpu::BindGroupLayout,
    pub render_layout: wgpu::BindGroupLayout,
}

pub(super) struct WaveformFactory {
    pub mailbox: GpuCanvasMailbox<Waveform>,
    pub pipelines: Arc<Mutex<Option<Arc<Pipelines>>>>,
    pub source: Option<SourceWaveform>,
}
pub(super) struct WaveformRenderer {
    pub mailbox: GpuCanvasMailbox<Waveform>,
    pub pipelines: Arc<Pipelines>,
    pub input: wgpu::Buffer,
    pub output: wgpu::Buffer,
    pub uniform: wgpu::Buffer,
    pub analysis: wgpu::BindGroup,
    pub strips: wgpu::BindGroup,
    pub data: Option<Arc<Waveform>>,
    pub columns: u32,
    pub source: Option<SourceWaveform>,
}
pub(super) type SourceWaveform = Arc<Mutex<Option<Arc<Waveform>>>>;

pub(super) struct Slot {
    pub registration: GpuCanvasRegistration,
    pub target: Target,
    pub video: bool,
    pub busy: AtomicBool,
}

pub(super) struct Pool {
    pub slots: Vec<Arc<Slot>>,
}

pub(super) struct Lease(pub Arc<Slot>);
