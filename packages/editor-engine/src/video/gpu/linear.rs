//! Export GL NV12 planes as linear DMA-BUF for hardware encoders.
//! Linear DMA-BUF can use ordinary NV12 caps; GstVideoMeta carries plane layouts.
use crate::{Result, video::pipeline::media};
use gst::{glib, prelude::*, subclass::prelude::*};
use gst_allocators::prelude::*;
use gst_base::subclass::{
    base_transform::{BaseTransformMode, InputBuffer, PrepareOutputBufferSuccess},
    prelude::*,
};
use gst_gl::prelude::*;
use std::sync::OnceLock;

/// Changes only the memory contract, preserving canvas dimensions and timing.
pub fn caps(direction: gst::PadDirection, input: &gst::Caps) -> gst::Caps {
    let mut output = gst::Caps::new_empty();
    for (structure, _) in input.iter_with_features() {
        let mut structure = structure.to_owned();
        structure.remove_field("drm-format");
        let features = if direction == gst::PadDirection::Sink {
            structure.remove_field("texture-target");
            gst::CapsFeatures::new_empty()
        } else {
            structure.set("texture-target", "2D");
            gst::CapsFeatures::new(["memory:GLMemory"])
        };
        output
            .get_mut()
            .unwrap()
            .append_structure_full(structure, Some(features));
    }
    output
}

/// Shares the two NV12 GL planes and leases their producer until encoder release.
pub fn export(input: &gst::BufferRef, info: &gst_video::VideoInfo) -> Result<gst::Buffer> {
    if info.format() != gst_video::VideoFormat::Nv12 || input.n_memory() != 2 {
        return Err(media("GPU encoder transfer requires two NV12 GL planes"));
    }
    let context = super::egl::context(input.peek_memory(0))?;
    if let Some(sync) = input.meta::<gst_gl::GLSyncMeta>() {
        sync.wait_cpu(&context);
    }
    let mut result = Err(media("GPU plane export did not run"));
    context.thread_add(|context| {
        result = (|| {
            let mut output = gst::Buffer::new();
            let buffer = output.get_mut().unwrap();
            let allocator = gst_allocators::DmaBufAllocator::new();
            let mut offsets = [0; 2];
            let mut strides = [0; 2];
            let mut total: usize = 0;
            for plane in 0..2 {
                let memory = input.peek_memory(plane);
                if super::egl::context(memory)? != *context {
                    return Err(media("GPU planes have different owners"));
                }
                let (fd, stride, offset, size) = super::egl::plane(context, memory)?;
                if stride < info.width() as i32 {
                    return Err(media("GPU encoder plane is too narrow"));
                }
                offsets[plane] = total
                    .checked_add(offset)
                    .ok_or_else(|| media("GPU plane offset overflow"))?;
                strides[plane] = stride;
                total = total
                    .checked_add(size)
                    .ok_or_else(|| media("GPU buffer size overflow"))?;
                // SAFETY: a newly exported linear DMA-BUF has this checked byte extent.
                let memory = unsafe { allocator.alloc_dmabuf(fd, size) }.map_err(media)?;
                buffer.append_memory(memory);
            }
            gst_video::VideoMeta::add_full(
                buffer,
                gst_video::VideoFrameFlags::empty(),
                gst_video::VideoFormat::Nv12,
                info.width(),
                info.height(),
                &offsets,
                &strides,
            )
            .map_err(media)?;
            input
                .copy_into(
                    buffer,
                    gst::BufferCopyFlags::TIMESTAMPS | gst::BufferCopyFlags::FLAGS,
                    ..,
                )
                .map_err(media)?;
            gst::ParentBufferMeta::add(buffer, &input.to_owned());
            Ok(output)
        })();
    });
    result
}
mod imp {
    use super::*;
    #[derive(Default)]
    pub struct Linear;
    #[glib::object_subclass]
    impl ObjectSubclass for Linear {
        const NAME: &'static str = "BeamLinearDmaBuf";
        type Type = super::Linear;
        type ParentType = gst_base::BaseTransform;
    }
    impl ObjectImpl for Linear {}
    impl GstObjectImpl for Linear {}
    impl ElementImpl for Linear {
        fn metadata() -> Option<&'static gst::subclass::ElementMetadata> {
            static META: OnceLock<gst::subclass::ElementMetadata> = OnceLock::new();
            Some(META.get_or_init(|| {
                gst::subclass::ElementMetadata::new(
                    "Beam GPU encoder memory bridge",
                    "Filter/Video",
                    "Shares GL NV12 allocations with hardware encoders",
                    "Beam",
                )
            }))
        }
        fn pad_templates() -> &'static [gst::PadTemplate] {
            static PADS: OnceLock<Vec<gst::PadTemplate>> = OnceLock::new();
            PADS.get_or_init(|| {
                [
                    (
                        "sink",
                        gst::PadDirection::Sink,
                        "video/x-raw(memory:GLMemory),format=NV12,texture-target=2D",
                    ),
                    ("src", gst::PadDirection::Src, "video/x-raw,format=NV12"),
                ]
                .into_iter()
                .map(|(name, direction, caps)| {
                    gst::PadTemplate::new(
                        name,
                        direction,
                        gst::PadPresence::Always,
                        &caps.parse::<gst::Caps>().unwrap(),
                    )
                    .unwrap()
                })
                .collect()
            })
        }
    }
    impl BaseTransformImpl for Linear {
        const MODE: BaseTransformMode = BaseTransformMode::NeverInPlace;
        const PASSTHROUGH_ON_SAME_CAPS: bool = false;
        const TRANSFORM_IP_ON_PASSTHROUGH: bool = false;
        fn transform_caps(
            &self,
            direction: gst::PadDirection,
            input: &gst::Caps,
            filter: Option<&gst::Caps>,
        ) -> Option<gst::Caps> {
            let output = caps(direction, input);
            Some(filter.map_or_else(|| output.clone(), |filter| filter.intersect(&output)))
        }
        fn prepare_output_buffer(
            &self,
            input: InputBuffer,
        ) -> std::result::Result<PrepareOutputBufferSuccess, gst::FlowError> {
            let input: &gst::BufferRef = match input {
                InputBuffer::Readable(input) => input,
                InputBuffer::Writable(input) => input,
            };
            let result = self
                .obj()
                .sink_pad()
                .current_caps()
                .ok_or_else(|| media("GPU encoder input has no caps"))
                .and_then(|caps| gst_video::VideoInfo::from_caps(&caps).map_err(media))
                .and_then(|info| export(input, &info));
            result
                .map(PrepareOutputBufferSuccess::Buffer)
                .map_err(|error| {
                    gst::element_error!(
                        self.obj(),
                        gst::ResourceError::Failed,
                        ["GPU encoder transfer failed: {error}"]
                    );
                    gst::FlowError::Error
                })
        }
        fn transform(
            &self,
            _: &gst::Buffer,
            _: &mut gst::BufferRef,
        ) -> std::result::Result<gst::FlowSuccess, gst::FlowError> {
            Ok(gst::FlowSuccess::Ok)
        }
        fn transform_meta<'a>(
            &self,
            _: &mut gst::BufferRef,
            _: gst::MetaRef<'a, gst::Meta>,
            _: &'a gst::BufferRef,
        ) -> bool {
            false
        }
    }
}
glib::wrapper! { pub struct Linear(ObjectSubclass<imp::Linear>) @extends gst_base::BaseTransform, gst::Element, gst::Object; }
pub(crate) fn register() -> Result<()> {
    gst::Element::register(
        None,
        "beamlineardmabuf",
        gst::Rank::NONE,
        Linear::static_type(),
    )
    .map_err(media)
}
