use std::any::TypeId;

use beam_media_manifest::{
    TrackFormat as SharedTrackFormat, TrackKind as SharedTrackKind,
    TrackMetadata as SharedTrackMetadata, TrackMetrics as SharedTrackMetrics,
    TrackStatus as SharedTrackStatus,
};
use capture::model::{TrackFormat, TrackKind, TrackMetadata, TrackMetrics, TrackStatus};

#[test]
fn legacy_capture_track_types_are_the_shared_manifest_contract() {
    assert_eq!(
        TypeId::of::<TrackFormat>(),
        TypeId::of::<SharedTrackFormat>()
    );
    assert_eq!(TypeId::of::<TrackKind>(), TypeId::of::<SharedTrackKind>());
    assert_eq!(
        TypeId::of::<TrackMetadata>(),
        TypeId::of::<SharedTrackMetadata>()
    );
    assert_eq!(
        TypeId::of::<TrackMetrics>(),
        TypeId::of::<SharedTrackMetrics>()
    );
    assert_eq!(
        TypeId::of::<TrackStatus>(),
        TypeId::of::<SharedTrackStatus>()
    );
}
