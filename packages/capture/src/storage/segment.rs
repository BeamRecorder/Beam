use crate::model::{SegmentId, SegmentMetadata};
pub fn segment(path: String, start_ns: u64) -> SegmentMetadata {
    SegmentMetadata {
        segment_id: SegmentId::new(),
        path,
        start_ns,
        end_ns: None,
        complete: false,
    }
}
pub fn finish_segment(
    segment: &mut SegmentMetadata,
    end_ns: u64,
) -> Result<(), crate::CaptureError> {
    if end_ns < segment.start_ns {
        return Err(crate::CaptureError::InvalidConfiguration(
            "segment end precedes start".into(),
        ));
    }
    segment.end_ns = Some(end_ns);
    segment.complete = true;
    Ok(())
}
