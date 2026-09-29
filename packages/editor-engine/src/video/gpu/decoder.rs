//! VA surfaces are imported by OpenGL before any CPU-only GES helper can map them.
//! GES 1.28 still uses system-memory clip helpers. This bridge keeps decoding on
//! the GPU and performs its required readback from GL, rather than mapping VA.
use crate::{Result, video::pipeline::media};
use gst::{glib, prelude::*, subclass::prelude::*};
use std::sync::{Mutex, OnceLock};

fn wire(bin: &gst::Bin, decoder: &str) -> Result<()> {
    bin.set_context(super::display_context());
    let source = gst::ElementFactory::make(decoder).build().map_err(media)?;
    // Matroska's VP9 caps can omit profile and framing. Autoplug selects this
    // wrapper from its encoded template, so the hardware input still needs its
    // normal bitstream parser even when decodebin did not insert one outside.
    let parser = (decoder == "vavp9dec")
        .then(|| gst::ElementFactory::make("vp9parse").build().map_err(media))
        .transpose()?;
    let bridge = gst::parse::bin_from_description(
        "glupload ! glcolorconvert ! video/x-raw(memory:GLMemory),format=RGBA,texture-target=2D ! identity",
        true,
    ).map_err(media)?;
    bin.add_many([&source, bridge.upcast_ref()])
        .map_err(media)?;
    source.link(&bridge).map_err(media)?;
    if let Some(parser) = &parser {
        bin.add(parser).map_err(media)?;
        parser.link(&source).map_err(media)?;
    }
    super::meta::protect(
        &source
            .static_pad("src")
            .ok_or_else(|| media("hardware decoder output is missing"))?,
        &bridge
            .static_pad("src")
            .ok_or_else(|| media("GPU decoder bridge output is missing"))?,
    );
    for (name, element) in [
        ("sink", parser.as_ref().unwrap_or(&source)),
        ("src", bridge.upcast_ref()),
    ] {
        let target = element
            .static_pad(name)
            .ok_or_else(|| media("GPU decoder pad is missing"))?;
        bin.add_pad(
            &gst::GhostPad::builder_with_target(&target)
                .map_err(media)?
                .name(name)
                .build(),
        )
        .map_err(media)?;
    }
    Ok(())
}

macro_rules! decoder {
    ($module:ident, $type_name:literal, $hardware:literal, $caps:literal) => {
        mod $module {
            use super::*;
            #[derive(Default)]
            pub struct Implementation { error: Mutex<Option<String>> }
            #[glib::object_subclass]
            impl ObjectSubclass for Implementation {
                const NAME: &'static str = $type_name;
                type Type = Decoder;
                type ParentType = gst::Bin;
            }
            impl ObjectImpl for Implementation {
                fn constructed(&self) {
                    self.parent_constructed();
                    if let Err(error) = wire(self.obj().upcast_ref(), $hardware) {
                        *self.error.lock().unwrap_or_else(|e| e.into_inner()) = Some(error.to_string());
                    }
                }
            }
            impl GstObjectImpl for Implementation {}
            impl ElementImpl for Implementation {
                fn metadata() -> Option<&'static gst::subclass::ElementMetadata> {
                    static META: OnceLock<gst::subclass::ElementMetadata> = OnceLock::new();
                    Some(META.get_or_init(|| gst::subclass::ElementMetadata::new(
                        concat!("Beam GL bridge for ", $hardware),
                        "Codec/Decoder/Video/Hardware",
                        "Hardware decoding with GPU surface conversion for GES",
                        "Beam",
                    )))
                }
                fn pad_templates() -> &'static [gst::PadTemplate] {
                    static PADS: OnceLock<Vec<gst::PadTemplate>> = OnceLock::new();
                    PADS.get_or_init(|| vec![
                        gst::PadTemplate::new("sink", gst::PadDirection::Sink, gst::PadPresence::Always,
                            &$caps.parse::<gst::Caps>().expect("constant encoded caps")).expect("constant sink template"),
                        gst::PadTemplate::new("src", gst::PadDirection::Src, gst::PadPresence::Always,
                            &gst::Caps::builder("video/x-raw").features(["memory:GLMemory"]).field("format", "RGBA").field("texture-target", "2D").build()).expect("constant source template"),
                    ])
                }
                fn change_state(&self, transition: gst::StateChange) -> std::result::Result<gst::StateChangeSuccess, gst::StateChangeError> {
                    if transition == gst::StateChange::NullToReady
                        && let Some(error) = self.error.lock().unwrap_or_else(|e| e.into_inner()).as_ref()
                    {
                        gst::element_error!(&*self.obj(), gst::CoreError::Failed, ("GPU decoder initialization failed: {error}"));
                        return Err(gst::StateChangeError);
                    }
                    self.parent_change_state(transition)
                }
            }
            impl BinImpl for Implementation {}
            glib::wrapper! { pub struct Decoder(ObjectSubclass<Implementation>) @extends gst::Bin, gst::Element, gst::Object; }
            pub fn register() -> Result<()> {
                if let Some(factory) = gst::ElementFactory::find($hardware) {
                    gst::Element::register(None, concat!("beamgl", $hardware), factory.rank() + 10, Decoder::static_type())
                        .map_err(media)?;
                }
                Ok(())
            }
        }
    };
}
decoder!(vp8, "BeamGlVaVp8Decoder", "vavp8dec", "video/x-vp8");
decoder!(vp9, "BeamGlVaVp9Decoder", "vavp9dec", "video/x-vp9");
decoder!(av1, "BeamGlVaAv1Decoder", "vaav1dec", "video/x-av1");
decoder!(h264, "BeamGlVaH264Decoder", "vah264dec", "video/x-h264");
decoder!(h265, "BeamGlVaH265Decoder", "vah265dec", "video/x-h265");

/// Register adapters only when their hardware decoder exists; never register a CPU substitute.
pub(super) fn register() -> Result<()> {
    vp8::register()?;
    vp9::register()?;
    av1::register()?;
    h264::register()?;
    h265::register()
}
