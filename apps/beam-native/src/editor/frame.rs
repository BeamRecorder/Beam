//! Returns a registered GPU viewport identity; no pixels or image assets cross the service.
use super::types::FrameResult;
use crate::ServiceRegistry;
use beam_editor_engine::EditorController;
use std::sync::Arc;
pub(super) fn register(
    registry: &ServiceRegistry,
    controller: Arc<EditorController>,
    canvas_id: u64,
) {
    registry.register("editor", "frame", move |_| {
        super::result((|| {
            let transport = controller.transport().map_err(|e| e.to_string())?;
            let canvas_id =
                (transport.duration_ms > 0 && transport.error.is_none()).then_some(canvas_id);
            Ok(FrameResult {
                transport,
                canvas_id,
            })
        })())
    });
}
