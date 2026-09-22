use std::any::TypeId;

use beam_media_manifest::{
    ProjectId as SharedProjectId, SegmentId as SharedSegmentId, SessionId as SharedSessionId,
    SourceId as SharedSourceId, TrackId as SharedTrackId,
};
use capture::model::{ProjectId, SegmentId, SessionId, SourceId, TrackId};

#[test]
fn legacy_capture_ids_are_the_shared_manifest_ids() {
    assert_eq!(TypeId::of::<ProjectId>(), TypeId::of::<SharedProjectId>());
    assert_eq!(TypeId::of::<SessionId>(), TypeId::of::<SharedSessionId>());
    assert_eq!(TypeId::of::<TrackId>(), TypeId::of::<SharedTrackId>());
    assert_eq!(TypeId::of::<SegmentId>(), TypeId::of::<SharedSegmentId>());
    assert_eq!(TypeId::of::<SourceId>(), TypeId::of::<SharedSourceId>());
}
