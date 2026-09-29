//! End-to-end hardware export preserves the visible canvas, rather than just file metadata.
use beam_editor_engine::{
    Canvas, Document, EditorController,
    export::types::{Container, ExportPhase},
    project::store::ProjectStore,
};
use gst::prelude::*;

#[test]
#[ignore = "requires hardware MP4/WebM encoders and OpenGL; uses no GUI"]
fn gpu_exports_preserve_visible_pixels_canvas_dimensions_and_originals() {
    gst::init().unwrap();
    let media = tempfile::tempdir().unwrap();
    let source = media.path().join("green.webm");
    let pipeline=gst::parse::launch(&format!("videotestsrc num-buffers=30 pattern=green ! video/x-raw,width=320,height=180,framerate=30/1 ! vp8enc deadline=1 ! webmmux ! filesink location=\"{}\"",source.display())).unwrap().downcast::<gst::Pipeline>().unwrap();
    pipeline.set_state(gst::State::Playing).unwrap();
    let message = pipeline
        .bus()
        .unwrap()
        .timed_pop_filtered(
            gst::ClockTime::from_seconds(5),
            &[gst::MessageType::Eos, gst::MessageType::Error],
        )
        .unwrap();
    pipeline.set_state(gst::State::Null).unwrap();
    assert!(matches!(message.view(), gst::MessageView::Eos(..)));
    let original = std::fs::read(&source).unwrap();
    let root = tempfile::tempdir().unwrap();
    let asset = beam_editor_engine::video::probe::import(root.path(), &source).unwrap();
    let mut project = crate::fixtures::project();
    project.canvas = Canvas::from_source(320, 180);
    crate::video::clip_mut(&mut project, 0).asset_id = asset.id;
    crate::video::clip_mut(&mut project, 0).duration_ms = asset.duration_ms;
    project.assets = vec![asset];
    {
        ProjectStore::lock(root.path())
            .unwrap()
            .write(&Document::new(project))
            .unwrap();
    }
    let controller = EditorController::new().unwrap();
    controller.open(root.path().into()).unwrap();
    for container in [Container::Mp4, Container::Webm] {
        let output = media
            .path()
            .join(format!("result.{}", container.extension()));
        controller.export(output.clone(), container).unwrap();
        let status = crate::fixtures::wait_export(&controller);
        assert_eq!(status.phase, ExportPhase::Completed, "{:?}", status.error);
        let pipeline=gst::parse::launch(&format!("filesrc location=\"{}\" ! decodebin ! glupload ! glcolorconvert ! video/x-raw(memory:GLMemory),format=RGBA,texture-target=2D ! gldownload ! video/x-raw,format=RGBA ! appsink name=decoded",output.display())).unwrap().downcast::<gst::Pipeline>().unwrap();
        pipeline.set_context(beam_editor_engine::video::gpu::display_context());
        let sink = pipeline
            .by_name("decoded")
            .unwrap()
            .downcast::<gst_app::AppSink>()
            .unwrap();
        pipeline.set_state(gst::State::Playing).unwrap();
        let sample = sink
            .try_pull_sample(gst::ClockTime::from_seconds(5))
            .unwrap();
        let info = gst_video::VideoInfo::from_caps(sample.caps().unwrap()).unwrap();
        assert_eq!((info.width(), info.height()), (320, 180));
        let frame =
            gst_video::VideoFrameRef::from_buffer_ref_readable(sample.buffer().unwrap(), &info)
                .unwrap();
        let pixels = frame.plane_data(0).unwrap();
        let row = info.stride()[0] as usize;
        for (x, y) in [(8, 8), (160, 90), (311, 171)] {
            let pixel = &pixels[y * row + x * 4..y * row + x * 4 + 4];
            assert!(
                pixel[0] < 20 && pixel[1] > 230 && pixel[2] < 20 && pixel[3] == 255,
                "{container:?} {pixel:?}"
            );
        }
        pipeline.set_state(gst::State::Null).unwrap();
    }
    assert_eq!(std::fs::read(source).unwrap(), original);
}

#[test]
#[ignore = "real native sequence alpha, GL and opaque VA VP9 export"]
fn sequence_alpha_is_resolved_against_the_canvas_for_opaque_hardware_output() {
    use beam_editor_domain::{
        animation::{Binding, Value},
        effects::definition,
    };
    use beam_editor_engine::{
        export::{segments, types::VideoEncoder},
        video::scoped_pipeline,
    };
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let mut project = crate::video::effects::project();
        project.canvas.width = 128;
        project.canvas.height = 96;
        project.canvas.background = 0xff0000ff;
        let mut opacity = definition(&project.definitions, "beam.opacity", 2)
            .unwrap()
            .instantiate();
        opacity
            .parameters
            .insert("opacity".into(), Binding::constant(Value::Number(0.5)));
        project.sequence_instances.push(opacity);
        let output = root.path().join("alpha.webm");
        let report = segments::render_with_source(
            root.path(),
            &project,
            &output,
            Container::Webm,
            VideoEncoder::new("VP9", "video/x-vp9", "vavp9enc"),
            std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            |_| {},
            Default::default(),
            scoped_pipeline::build_window,
        )
        .unwrap()
        .unwrap();
        assert_eq!((report.video_frames, report.audio_samples), (30, 0));
        let frames = super::scopes::pixels(&output);
        assert_eq!(frames.len(), 30);
        for pixel in frames {
            assert!(
                (i16::from(pixel[0]) - 128).abs() <= 10
                    && pixel[1] < 10
                    && (i16::from(pixel[2]) - 128).abs() <= 10
                    && pixel[3] == 255,
                "sequence alpha must blend red over blue: {pixel:?}"
            );
        }
    });
}
