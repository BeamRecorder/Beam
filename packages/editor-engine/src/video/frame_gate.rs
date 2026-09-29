//! Sink events identify frames even when an old seek has the same timestamp.
use super::frame_gate_types::SegmentGate;
use crate::{EditorError, Result};
use gst::glib::translate::IntoGlib;
use std::sync::Once;

const MARKER: &str = "BeamPreviewSegment";

pub(crate) fn register() {
    static REGISTER: Once = Once::new();
    REGISTER.call_once(|| gst::meta::CustomMeta::register_simple(MARKER));
}

impl SegmentGate {
    pub fn expect(&mut self, seqnum: gst::Seqnum) {
        self.expected = Some(seqnum);
    }

    pub fn observe(&mut self, event: &gst::EventRef) {
        match event.view() {
            gst::EventView::Segment(_) => {
                self.active = Some(event.seqnum());
                self.flushing = false;
            }
            gst::EventView::FlushStart(_) | gst::EventView::FlushStop(_) => {
                self.active = None;
                self.flushing = true;
            }
            _ => {}
        }
    }

    pub fn active(&self) -> Option<gst::Seqnum> {
        self.active
    }

    pub fn accepts(&self, marker: Option<gst::Seqnum>) -> bool {
        !self.flushing
            && marker == self.active
            && self
                .expected
                .is_none_or(|expected| marker == Some(expected))
    }

    /// Keep a sample's identity across delayed callbacks and buffer references.
    pub fn stamp(&self, buffer: &mut gst::BufferRef) -> Result<()> {
        register();
        if gst::meta::CustomMeta::from_buffer(buffer, MARKER).is_ok() {
            return Ok(());
        }
        let seqnum = self.active.ok_or_else(|| {
            EditorError::Media("preview buffer arrived before its Segment".into())
        })?;
        let mut meta = gst::meta::CustomMeta::add(buffer, MARKER)
            .map_err(|error| EditorError::Media(error.to_string()))?;
        meta.mut_structure().set("seqnum", seqnum.into_glib());
        Ok(())
    }

    pub fn marker(&self, buffer: &gst::BufferRef) -> Option<gst::Seqnum> {
        let meta = gst::meta::CustomMeta::from_buffer(buffer, MARKER).ok()?;
        let seqnum = meta.structure().get::<u32>("seqnum").ok()?;
        self.active.filter(|active| active.into_glib() == seqnum)
    }
}
