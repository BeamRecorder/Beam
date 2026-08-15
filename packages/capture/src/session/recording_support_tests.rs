use crate::{
    model::{TrackFormat, TrackId, TrackKind, TrackMetadata, TrackMetrics, TrackStatus},
    screen::{PixelFormat, VideoFormat},
};

use super::{insufficient_disk_space_message, update_video_format};

#[test]
fn insufficient_disk_space_message_uses_mb() {
    assert_eq!(
        insufficient_disk_space_message(401_031_168, 536_870_912),
        "insufficient disk space: 382 MB available, 512 MB required"
    );
}

#[test]
fn insufficient_disk_space_message_rounds_required_mb_up() {
    assert_eq!(
        insufficient_disk_space_message(1_048_576, 1_048_577),
        "insufficient disk space: 1 MB available, 2 MB required"
    );
}

#[test]
fn update_video_format_updates_video_dimensions_without_touching_event_tracks() {
    let mut tracks = vec![
        TrackMetadata {
            track_id: TrackId::new(),
            kind: TrackKind::Screen,
            source_id: None,
            format: TrackFormat::Video {
                codec: "h264".into(),
                width: 1280,
                height: 720,
                nominal_fps: 60,
            },
            segments: Vec::new(),
            metrics: TrackMetrics::default(),
            status: TrackStatus::Preparing,
            termination_reason: None,
        },
        TrackMetadata {
            track_id: TrackId::new(),
            kind: TrackKind::Cursor,
            source_id: None,
            format: TrackFormat::Events {
                format: "json".into(),
            },
            segments: Vec::new(),
            metrics: TrackMetrics::default(),
            status: TrackStatus::Preparing,
            termination_reason: None,
        },
    ];

    update_video_format(
        &mut tracks,
        TrackKind::Screen,
        VideoFormat {
            width: 1920,
            height: 1164,
            stride: 1920 * 4,
            pixel_format: PixelFormat::Bgra8,
        },
    );

    assert!(matches!(
        &tracks[0].format,
        TrackFormat::Video {
            codec,
            width: 1920,
            height: 1164,
            nominal_fps: 60,
        } if codec == "h264"
    ));
    assert!(matches!(
        &tracks[1].format,
        TrackFormat::Events { format } if format == "json"
    ));

    update_video_format(
        &mut tracks,
        TrackKind::Cursor,
        VideoFormat {
            width: 3072,
            height: 1920,
            stride: 3072 * 4,
            pixel_format: PixelFormat::Bgra8,
        },
    );
    assert!(matches!(
        &tracks[1].format,
        TrackFormat::Events { format } if format == "json"
    ));
}
