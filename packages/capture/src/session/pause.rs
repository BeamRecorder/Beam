use crate::model::{SegmentId, SegmentMetadata, TrackId};

#[derive(Debug, Clone)]
pub struct SegmentBoundary {
    pub track_id: TrackId,
    pub segment: SegmentMetadata,
}

#[derive(Debug, Default)]
pub struct PauseSegments {
    generation: u32,
}

impl PauseSegments {
    #[must_use]
    pub fn next(
        &mut self,
        track_id: TrackId,
        directory: &str,
        extension: &str,
        start_ns: u64,
    ) -> SegmentBoundary {
        self.generation = self.generation.saturating_add(1);
        SegmentBoundary {
            track_id,
            segment: SegmentMetadata {
                segment_id: SegmentId::new(),
                path: format!("{directory}/segment-{:04}.{extension}", self.generation),
                start_ns,
                end_ns: None,
                complete: false,
            },
        }
    }
}
