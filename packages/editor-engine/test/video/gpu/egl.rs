//! The EGL encoder handoff shares GPU planes and their producer, with no pixel map.
#[cfg(target_os = "linux")]
#[test]
#[ignore = "requires EGL DMA-BUF texture export; uses no GUI"]
fn egl_nv12_export_preserves_native_planes_timestamps_and_producer_lease() {
    use beam_editor_engine::video::gpu;
    use gst::prelude::*;
    gpu::initialize().unwrap();
    let pipeline=gst::parse::launch("videotestsrc num-buffers=1 pattern=green ! video/x-raw,width=320,height=180,framerate=30/1 ! glupload ! glcolorconvert ! video/x-raw(memory:GLMemory),format=NV12,texture-target=2D ! appsink name=frame").unwrap().downcast::<gst::Pipeline>().unwrap();
    pipeline.set_context(gpu::display_context());
    let sink = pipeline
        .by_name("frame")
        .unwrap()
        .downcast::<gst_app::AppSink>()
        .unwrap();
    pipeline.set_state(gst::State::Playing).unwrap();
    let sample = sink
        .try_pull_sample(gst::ClockTime::from_seconds(5))
        .unwrap();
    let input = sample.buffer().unwrap();
    let info = gst_video::VideoInfo::from_caps(sample.caps().unwrap()).unwrap();
    let output = gpu::linear::export(input, &info).unwrap();
    assert_eq!(output.n_memory(), 2);
    for memory in output.iter_memories() {
        assert!(
            memory
                .downcast_memory_ref::<gst_allocators::DmaBufMemory>()
                .is_some()
        );
    }
    for memory in input.iter_memories() {
        assert!(memory.downcast_memory_ref::<gst_gl::GLMemory>().is_some());
    }
    assert_eq!(output.pts(), input.pts());
    assert_eq!(output.duration(), input.duration());
    assert!(output.meta::<gst::ParentBufferMeta>().is_some());
    let meta = output.meta::<gst_video::VideoMeta>().unwrap();
    assert_eq!((meta.width(), meta.height()), (320, 180));
    assert!(meta.stride().iter().all(|&stride| stride >= 320));
    assert_eq!(meta.format(), gst_video::VideoFormat::Nv12);
    pipeline.set_state(gst::State::Null).unwrap();
}
