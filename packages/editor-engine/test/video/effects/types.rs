use beam_editor_engine::{
    PreviewFrame, Project,
    video::{pipeline, preview, types::FrameMailbox},
};
use ges::prelude::*;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

pub struct Render {
    pub pipeline: ges::Pipeline,
    pub frames: Arc<FrameMailbox>,
}
impl Render {
    pub fn new(root: &std::path::Path, project: &Project) -> Self {
        let audio = project
            .assets
            .iter()
            .any(|a| a.has_audio)
            .then(|| gst::ElementFactory::make("fakesink").build().unwrap());
        Self::with_sink(root, project, audio.as_ref())
    }
    pub fn with_audio(root: &std::path::Path, project: &Project) -> (Self, gst_app::AppSink) {
        let bin=gst::parse::bin_from_description("audioconvert ! audioresample ! audio/x-raw,format=F32LE,rate=48000,channels=1 ! appsink name=beam_audio sync=false",true).unwrap();
        let sink = bin
            .by_name("beam_audio")
            .unwrap()
            .downcast::<gst_app::AppSink>()
            .unwrap();
        (Self::with_sink(root, project, Some(bin.upcast_ref())), sink)
    }
    fn with_sink(root: &std::path::Path, project: &Project, audio: Option<&gst::Element>) -> Self {
        let pipeline = pipeline::build(root, project).unwrap();
        let frames = Arc::new(FrameMailbox::default());
        preview::attach(&pipeline, &project.canvas, frames.clone()).unwrap();
        pipeline.preview_set_audio_sink(audio);
        if audio.is_none() {
            pipeline
                .set_mode(ges::PipelineFlags::VIDEO_PREVIEW)
                .unwrap();
        }
        pipeline.set_state(gst::State::Paused).unwrap();
        if let Err(error) = frames.wait(Duration::from_secs(30)) {
            let message = pipeline
                .bus()
                .unwrap()
                .pop_filtered(&[gst::MessageType::Error]);
            pipeline.set_state(gst::State::Null).unwrap();
            panic!("native preroll failed: {error}; {message:?}");
        }
        Self { pipeline, frames }
    }
    pub fn image(&self, time: u64) -> PreviewFrame {
        self.frames
            .seek(&self.pipeline, gst::ClockTime::from_mseconds(time), 30, 1)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(30);
        if let Err(error) = self.frames.wait(Duration::from_secs(30)) {
            let message = self
                .pipeline
                .bus()
                .unwrap()
                .pop_filtered(&[gst::MessageType::Error]);
            panic!("native seek failed: {error}; {message:?}");
        }
        loop {
            let (status, current, pending) =
                self.pipeline.state(gst::ClockTime::from_mseconds(100));
            status.expect("native seek preroll state");
            if current == gst::State::Paused && pending == gst::State::VoidPending {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "native seek at {time} did not complete: current={current:?}, pending={pending:?}"
            );
        }
        self.frames.take().unwrap()
    }
    pub fn center(&self, time: u64) -> [u8; 4] {
        let image = self.image(time);
        let index = ((image.height / 2 * image.width + image.width / 2) * 4) as usize;
        image.rgba[index..index + 4].try_into().unwrap()
    }
    pub fn audio(&self, sink: &gst_app::AppSink, time: u64) -> Vec<f32> {
        self.image(time);
        let sample = sink
            .try_pull_preroll(gst::ClockTime::from_seconds(5))
            .expect("audio seek preroll");
        let map = sample.buffer().unwrap().map_readable().unwrap();
        map.as_slice()
            .as_chunks::<4>()
            .0
            .iter()
            .map(|bytes| f32::from_le_bytes(*bytes))
            .collect()
    }
}
impl Drop for Render {
    fn drop(&mut self) {
        self.pipeline.set_state(gst::State::Null).unwrap();
    }
}

#[test]
fn a_generated_instance_is_real_gpu_artwork_without_an_imported_source() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let pixel = Render::new(root.path(), &super::project()).center(200);
        assert!(pixel[0] > 240 && pixel[1] < 5 && pixel[2] < 5, "{pixel:?}");
    });
}
