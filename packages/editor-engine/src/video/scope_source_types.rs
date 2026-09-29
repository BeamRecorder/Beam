//! A nested timeline is an independently seekable producer inside an NLE source.
use gst::{glib, prelude::*, subclass::prelude::*};

mod implementation {
    use super::*;
    #[derive(Default)]
    pub struct Source;
    #[glib::object_subclass]
    impl ObjectSubclass for Source {
        const NAME: &'static str = "BeamComposedScopeSource";
        type Type = super::ScopeSource;
        type ParentType = gst::Bin;
    }
    impl ObjectImpl for Source {}
    impl GstObjectImpl for Source {}
    impl ElementImpl for Source {}
    impl BinImpl for Source {
        fn handle_message(&self, message: gst::Message) {
            // NLE's outer source waits for the first buffer before forwarding
            // its initializing seek. Its nested composition must preroll first;
            // prevent the outer NLE from suppressing that real initial seek.
            if message.structure().is_some_and(|structure| {
                structure.name() == "nlecomposition-query-needs-initialization-seek"
            }) {
                return;
            }
            self.parent_handle_message(message);
        }
    }
}
glib::wrapper! {
    pub struct ScopeSource(ObjectSubclass<implementation::Source>)
        @extends gst::Bin, gst::Element, gst::Object;
}
impl ScopeSource {
    pub(crate) fn with_timeline(timeline: &ges::Timeline, video: bool) -> crate::Result<Self> {
        let source: Self = glib::Object::new();
        source.add(timeline).map_err(super::pipeline::media)?;
        let pad = timeline
            .src_pads()
            .into_iter()
            .next()
            .ok_or_else(|| super::pipeline::media("nested composition has no output"))?;
        let output = if video {
            // GL source-over mixing produces premultiplied RGB. One-input
            // processor definitions consume straight RGBA before the next mix.
            let shader = gst::ElementFactory::make("glshader")
                .property("fragment", "#ifdef GL_ES\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n#endif\nvarying vec2 v_texcoord;uniform sampler2D tex;void main(){vec4 c=texture2D(tex,v_texcoord);gl_FragColor=vec4(c.a>0.0?c.rgb/c.a:vec3(0.0),c.a);}")
                .build().map_err(super::pipeline::media)?;
            source.add(&shader).map_err(super::pipeline::media)?;
            let input = shader
                .static_pad("sink")
                .ok_or_else(|| super::pipeline::media("scope alpha kernel has no input"))?;
            let output = shader
                .static_pad("src")
                .ok_or_else(|| super::pipeline::media("scope alpha kernel has no output"))?;
            super::gpu::meta::protect(&input, &output);
            pad.link_full(&input, gst::PadLinkCheck::empty())
                .map_err(super::pipeline::media)?;
            output
        } else {
            pad
        };
        source
            .add_pad(
                &gst::GhostPad::builder_with_target(&output)
                    .map_err(super::pipeline::media)?
                    .name("src")
                    .build(),
            )
            .map_err(super::pipeline::media)?;
        Ok(source)
    }
}
