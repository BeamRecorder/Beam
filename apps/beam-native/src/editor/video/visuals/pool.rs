//! All bounded source factories register before the native renderer starts.
use super::types::Slot;
use super::types::Target;
pub(super) use super::types::{Lease, Pool};
use argui_render::{GpuCanvasMailbox, GpuCanvasRegistration};
use beam_editor_engine::video::visuals::types::VisualRequest;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

const CAPACITY: usize = 128;

impl Pool {
    pub fn new() -> Self {
        let video_resources = Default::default();
        let pipelines = Default::default();
        let mut slots = Vec::with_capacity(CAPACITY * 2);
        for video in [true, false] {
            for index in 0..CAPACITY {
                let (target, registration) = if video {
                    let mailbox = GpuCanvasMailbox::new();
                    let latest = Default::default();
                    let mut factory = super::super::canvas::Factory::new(mailbox.clone(), None);
                    factory.resources = Arc::clone(&video_resources);
                    factory.cover = true;
                    factory.source = Some(Arc::clone(&latest));
                    let registration =
                        GpuCanvasRegistration::new(format!("beam-source-video-{index}"), factory);
                    mailbox.bind(&registration);
                    (Target::Video { mailbox, latest }, registration)
                } else {
                    let mailbox = GpuCanvasMailbox::new();
                    let latest = Default::default();
                    let registration = GpuCanvasRegistration::new(
                        format!("beam-source-blick-{index}"),
                        super::waveform::Factory {
                            mailbox: mailbox.clone(),
                            pipelines: Arc::clone(&pipelines),
                            source: Some(Arc::clone(&latest)),
                        },
                    );
                    mailbox.bind(&registration);
                    (Target::Audio { mailbox, latest }, registration)
                };
                slots.push(Arc::new(Slot {
                    registration,
                    target,
                    video,
                    busy: AtomicBool::new(false),
                }));
            }
        }
        Self { slots }
    }

    pub fn registrations(&self) -> Vec<GpuCanvasRegistration> {
        self.slots
            .iter()
            .map(|slot| slot.registration.clone())
            .collect()
    }

    pub fn acquire(&self, request: &VisualRequest) -> Result<Lease, String> {
        let video = matches!(request, VisualRequest::Video { .. });
        let slot = self
            .slots
            .iter()
            .find(|slot| {
                slot.video == video
                    && slot
                        .busy
                        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                        .is_ok()
            })
            .ok_or("too many visible source previews")?;
        Ok(Lease(Arc::clone(slot)))
    }
}

impl Lease {
    pub fn registration(&self) -> GpuCanvasRegistration {
        self.0.registration.clone()
    }
    pub fn target(&self) -> Target {
        self.0.target.clone()
    }
}

impl Drop for Lease {
    fn drop(&mut self) {
        self.0.target.clear();
        self.0.registration.invalidate();
        self.0.busy.store(false, Ordering::Release);
    }
}
