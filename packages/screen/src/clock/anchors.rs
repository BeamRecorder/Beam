use crate::model::{TimingAnchor, TrackId};

#[derive(Debug, Default)]
pub struct AnchorSeries {
    anchors: Vec<TimingAnchor>,
}

impl AnchorSeries {
    pub fn push(&mut self, anchor: TimingAnchor) -> Result<(), crate::CaptureError> {
        if anchor.native_rate == 0 {
            return Err(crate::CaptureError::InvalidConfiguration(
                "anchor rate must be non-zero".into(),
            ));
        }
        if self.anchors.last().is_some_and(|last| {
            last.track_id == anchor.track_id && last.session_ns > anchor.session_ns
        }) {
            return Err(crate::CaptureError::InvalidConfiguration(
                "anchors must be monotonic".into(),
            ));
        }
        self.anchors.push(anchor);
        Ok(())
    }
    #[must_use]
    pub fn for_track(&self, track_id: TrackId) -> Vec<&TimingAnchor> {
        self.anchors
            .iter()
            .filter(|a| a.track_id == track_id)
            .collect()
    }
}
