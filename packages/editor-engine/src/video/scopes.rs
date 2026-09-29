//! A composed timeline can become one native source, so effects see its mix.
use crate::{Result, video::pipeline::media};
use ges::prelude::*;

/// Do not accept a document whose requested post-mix processors are uncompiled.
/// This guard remains until nested video and audio scopes pass native proofs.
pub(crate) fn validate_native(project: &crate::Project) -> Result<()> {
    if !project.sequence_instances.is_empty()
        || project
            .tracks
            .headers()
            .any(|track| !track.instances.is_empty())
    {
        return Err(media(
            "native track and sequence effect rendering is not available yet",
        ));
    }
    Ok(())
}

/// Replace a native test source before preroll with a real composed video lane.
/// The nested timeline keeps absolute sequence timestamps and owns its decoders.
pub fn video_source(source: &ges::TrackElement, composition: &ges::Timeline) -> Result<()> {
    replace_source(source, composition, "videotestsrc")
}
pub(crate) fn audio_source(source: &ges::TrackElement, composition: &ges::Timeline) -> Result<()> {
    replace_source(source, composition, "audiotestsrc")
}
fn replace_source(
    source: &ges::TrackElement,
    composition: &ges::Timeline,
    producer: &str,
) -> Result<()> {
    let bin = source
        .element()
        .and_then(|element| element.downcast::<gst::Bin>().ok())
        .ok_or_else(|| media("scoped source has no native bin"))?;
    if bin.current_state() != gst::State::Null || composition.current_state() != gst::State::Null {
        return Err(media("scope sources can only be composed before preroll"));
    }
    let pads = composition.src_pads();
    if pads.len() != 1 {
        return Err(media("a nested scope requires exactly one output"));
    }
    if composition.parent().is_some() {
        return Err(media("nested composition already has an owner"));
    }
    let old = bin
        .iterate_recurse()
        .into_iter()
        .flatten()
        .find(|element| {
            element
                .factory()
                .is_some_and(|factory| factory.name() == producer)
        })
        .ok_or_else(|| media("scoped source has no replaceable producer"))?;
    let owner = old
        .parent()
        .and_then(|parent| parent.downcast::<gst::Bin>().ok())
        .ok_or_else(|| media("scoped producer has no bin"))?;
    let old_pad = old
        .static_pad("src")
        .ok_or_else(|| media("scoped producer has no output"))?;
    let after = old_pad
        .peer()
        .ok_or_else(|| media("scoped producer output is unlinked"))?;
    // The test producer's private capsfilter fixes CPU memory and its natural
    // 1280x720 size. A composed lane supplies the negotiated canvas in GLMemory.
    let filter = after
        .parent()
        .and_then(|parent| parent.downcast::<gst::Element>().ok())
        .filter(|filter| {
            filter
                .factory()
                .is_some_and(|factory| factory.name() == "capsfilter")
        });
    let caps = if filter.is_some() {
        Some(
            composition
                .tracks()
                .into_iter()
                .find_map(|track| track.restriction_caps())
                .ok_or_else(|| media("composed source has no canvas caps"))?,
        )
    } else {
        None
    };
    if let (Some(filter), Some(caps)) = (filter, caps) {
        filter.set_property("caps", caps);
    }
    if let Some(peer) = pads[0].peer() {
        pads[0].unlink(&peer).map_err(media)?;
    }
    old_pad.unlink(&after).map_err(media)?;
    owner.remove(&old).map_err(media)?;
    let wrapped = super::scope_source_types::ScopeSource::with_timeline(
        composition,
        producer == "videotestsrc",
    )?;
    owner.add(&wrapped).map_err(media)?;
    wrapped
        .static_pad("src")
        .ok_or_else(|| media("nested scope has no output"))?
        .link_full(&after, gst::PadLinkCheck::empty())
        .map_err(media)?;
    if producer == "videotestsrc" {
        super::gpu::source::configure(source)?;
    }
    Ok(())
}
