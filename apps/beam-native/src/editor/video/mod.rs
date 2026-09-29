//! Native WGPU viewport registration and one-slot media delivery.
mod canvas;
mod external;
mod resources;
mod types;
mod visuals;
use argui_render::{GpuCanvasMailbox, GpuCanvasRegistration};
use beam_editor_engine::{EditorController, PreviewFrame};
use std::sync::Arc;

pub(super) fn register_visuals(
    registry: &Arc<crate::ServiceRegistry>,
    controller: Arc<EditorController>,
) -> Vec<GpuCanvasRegistration> {
    visuals::register(registry, controller)
}

/// The GStreamer actor publishes pixels directly to Rust; JavaScript receives only this ID.
pub(super) fn register(controller: &Arc<EditorController>) -> GpuCanvasRegistration {
    let mailbox = GpuCanvasMailbox::<PreviewFrame>::new();
    let registration = GpuCanvasRegistration::new(
        "beam-editor-preview",
        canvas::Factory::new(mailbox.clone(), Some(Arc::clone(controller))),
    );
    mailbox.bind(&registration);
    controller.set_frame_consumer(move |frame| {
        mailbox.publish(frame);
    });
    registration
}
