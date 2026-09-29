//! Real external frame publication through the public editor controller.
#[cfg(target_os = "linux")]
#[test]
#[ignore = "requires EGL DMA-BUF texture export; uses no GUI"]
fn gpu_preview_publication_keeps_gl_producer_without_mapping_pixels() {
    use beam_editor_engine::{
        EditorController,
        video::gpu::types::{ExternalFrame, PreviewTransport},
    };
    use std::sync::{Arc, Mutex};
    let media = tempfile::tempdir().unwrap();
    let root = tempfile::tempdir().unwrap();
    let controller = EditorController::new().unwrap();
    controller.set_preview_transport(PreviewTransport::DmaBuf);
    let frames = Arc::new(Mutex::new(Vec::new()));
    let delivered = Arc::clone(&frames);
    controller.set_frame_consumer(move |frame| delivered.lock().unwrap().push(frame));
    controller.create(root.path().into(), "GPU".into()).unwrap();
    controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "source.webm",
            false,
        )])
        .unwrap();
    controller.seek(600).unwrap();
    let frame = frames.lock().unwrap().pop().unwrap();
    assert!(frame.rgba.is_empty());
    let ExternalFrame::DmaBuf(image) = frame.external.unwrap();
    let _fd = image.descriptor().unwrap();
    assert!(image.stride >= u64::from(frame.width) * 4);
    assert!(
        image
            .producer()
            .iter_memories()
            .all(|memory| memory.downcast_memory_ref::<gst_gl::GLMemory>().is_some())
    );
}
