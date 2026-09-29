//! Each external preview retains the GPU buffer that produced that exact sample.
use crate::{Result, video::pipeline::media};
use gst::prelude::*;
use std::sync::{Arc, Mutex, Once};

const LEASE: &str = "BeamPreviewProducer";

fn register() {
    static REGISTER: Once = Once::new();
    REGISTER.call_once(|| gst::meta::CustomMeta::register_simple(LEASE));
}

pub(crate) fn attach(transfer: &gst::Element) -> Result<()> {
    register();
    let input = transfer
        .static_pad("sink")
        .ok_or_else(|| media("GPU preview transfer has no input"))?;
    let output = transfer
        .static_pad("src")
        .ok_or_else(|| media("GPU preview transfer has no output"))?;
    let pending = Arc::new(Mutex::new(None::<gst::Buffer>));
    let capture = pending.clone();
    input.add_probe(
        gst::PadProbeType::BUFFER | gst::PadProbeType::EVENT_FLUSH,
        move |_, info| {
            *capture.lock().unwrap_or_else(|p| p.into_inner()) = info.buffer().cloned();
            gst::PadProbeReturn::Ok
        },
    );
    output.add_probe(gst::PadProbeType::BUFFER, move |pad, info| {
        let producer = pending.lock().unwrap_or_else(|p| p.into_inner()).take();
        let result = (|| {
            let producer =
                producer.ok_or_else(|| media("GPU preview sample has no matching producer"))?;
            let buffer = info
                .buffer_mut()
                .ok_or_else(|| media("GPU preview transfer has no output buffer"))?;
            bind(buffer.make_mut(), producer)
        })();
        if let Err(error) = result {
            if let Some(element) = pad.parent_element() {
                gst::element_error!(element, gst::StreamError::Failed, ("{error}"));
            }
            return gst::PadProbeReturn::Drop;
        }
        gst::PadProbeReturn::Ok
    });
    Ok(())
}

/// Bind a transferred sample to its distinct GL producer with the same timestamp.
pub fn bind(sample: &mut gst::BufferRef, producer: gst::Buffer) -> Result<()> {
    if sample.pts().is_none() || sample.pts() != producer.pts() {
        return Err(media("GPU preview sample and producer timestamps differ"));
    }
    if sample.as_ptr() == producer.as_ptr() {
        return Err(media("GPU preview transfer cannot lease itself"));
    }
    if producer.n_memory() == 0
        || !producer
            .iter_memories()
            .all(|memory| memory.downcast_memory_ref::<gst_gl::GLMemory>().is_some())
    {
        return Err(media("GPU preview producer does not contain GL memory"));
    }
    register();
    gst::meta::CustomMeta::add(sample, LEASE)
        .map_err(media)?
        .mut_structure()
        .set("producer", producer);
    Ok(())
}

/// Read the lease carried by this sample, without mapping its memory.
pub fn producer(sample: &gst::Sample) -> Result<gst::Buffer> {
    let buffer = sample
        .buffer()
        .ok_or_else(|| media("GPU preview has no sample buffer"))?;
    gst::meta::CustomMeta::from_buffer(buffer, LEASE)
        .map_err(|_| media("GPU preview sample has no producer lease"))?
        .structure()
        .get::<gst::Buffer>("producer")
        .map_err(media)
}
