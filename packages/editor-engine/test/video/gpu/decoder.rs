use beam_editor_engine::video::gpu;
use gst::prelude::*;

#[test]
#[ignore = "requires the Intel VA VP8 decoder and OpenGL; uses no GUI"]
fn native_gpu_decoder_bridge_is_selected_and_preserves_original_factory_ranks() {
    gst::init().unwrap();
    let original = gst::ElementFactory::find("vavp8dec").expect("hardware VA VP8 decoder");
    let rank = original.rank();
    gpu::initialize().unwrap();
    assert_eq!(original.rank(), rank);
    assert!(
        gpu::display_context()
            .structure()
            .has_field("gst.gl.GLDisplay")
    );

    let media = tempfile::tempdir().unwrap();
    let source = crate::fixtures::media(media.path(), "hardware.webm", false);
    let pipeline = gst::parse::launch(&format!(
        "filesrc location=\"{}\" ! matroskademux ! decodebin ! video/x-raw(memory:GLMemory),format=RGBA,texture-target=2D ! gldownload ! video/x-raw,format=RGBA ! fakesink name=decoded signal-handoffs=true", source.display()
    )).unwrap().downcast::<gst::Pipeline>().unwrap();
    pipeline.set_context(gpu::display_context());
    let leases = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let observed = leases.clone();
    pipeline.connect_deep_element_added(move |_, _, element| {
        if element
            .factory()
            .is_some_and(|factory| factory.name() == "beamglvavp8dec")
        {
            let observed = observed.clone();
            element.static_pad("src").unwrap().add_probe(
                gst::PadProbeType::BUFFER,
                move |_, info| {
                    let buffer = info.buffer().unwrap();
                    observed.lock().unwrap().push(
                        buffer
                            .iter_meta::<gst::ParentBufferMeta>()
                            .any(|meta| meta.parent().pts() == buffer.pts()),
                    );
                    gst::PadProbeReturn::Ok
                },
            );
        }
    });
    let ranges = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let delivered = std::sync::Arc::clone(&ranges);
    pipeline
        .by_name("decoded")
        .unwrap()
        .connect("handoff", false, move |values| {
            let buffer = values[1].get::<gst::Buffer>().unwrap();
            let pad = values[2].get::<gst::Pad>().unwrap();
            let caps = pad.current_caps().unwrap();
            let info = gst_video::VideoInfo::from_caps(&caps).unwrap();
            let Ok(frame) = gst_video::VideoFrameRef::from_buffer_ref_readable(&buffer, &info)
            else {
                delivered.lock().unwrap().push((0, 0));
                return None;
            };
            let data = frame.plane_data(0).unwrap();
            let pixels = data.as_chunks::<4>().0.iter();
            let min_alpha = pixels.clone().map(|pixel| pixel[3]).min().unwrap();
            let max_rgb = pixels
                .flat_map(|pixel| pixel[..3].iter().copied())
                .max()
                .unwrap();
            delivered.lock().unwrap().push((min_alpha, max_rgb));
            None
        });
    pipeline.set_state(gst::State::Playing).unwrap();
    let message = pipeline
        .bus()
        .unwrap()
        .timed_pop_filtered(
            gst::ClockTime::from_seconds(10),
            &[gst::MessageType::Eos, gst::MessageType::Error],
        )
        .expect("hardware decoding completed");
    let factories: Vec<_> = pipeline
        .iterate_recurse()
        .into_iter()
        .flatten()
        .filter_map(|element| element.factory().map(|factory| factory.name().to_string()))
        .collect();
    pipeline.set_state(gst::State::Null).unwrap();
    let leases = leases.lock().unwrap();
    assert!(!leases.is_empty(), "observe actual GPU decoder outputs");
    assert!(
        leases.iter().all(|retained| *retained),
        "converted GPU buffers lease their native decoder input"
    );
    assert!(
        matches!(message.view(), gst::MessageView::Eos(..)),
        "{message:?}"
    );
    for expected in [
        "beamglvavp8dec",
        "vavp8dec",
        "glupload",
        "glcolorconvert",
        "gldownload",
    ] {
        assert!(
            factories.iter().any(|name| name == expected),
            "missing {expected}: {factories:?}"
        );
    }
    assert!(!factories.iter().any(|name| name == "vp8dec"));
    assert_eq!(original.rank(), rank);
    let ranges = ranges.lock().unwrap();
    assert_eq!(ranges.len(), 30);
    assert!(
        ranges
            .iter()
            .all(|(alpha, rgb)| *alpha == 255 && *rgb > 200),
        "{ranges:?}"
    );
}
