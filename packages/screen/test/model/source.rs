#![allow(clippy::expect_used)]

use beam_screen::model::MediaFormat;

#[test]
fn source_media_formats_keep_distinct_tagged_audio_and_video_shapes() {
    let audio = MediaFormat::Audio {
        sample_rate: 48_000,
        channels: 2,
        sample_format: "f32".into(),
    };
    let video = MediaFormat::Video {
        width: 1280,
        height: 720,
        fps: 30,
        pixel_format: Some("NV12".into()),
    };
    let audio_json = serde_json::to_value(&audio).expect("audio JSON");
    let video_json = serde_json::to_value(&video).expect("video JSON");
    assert_eq!(audio_json["type"], "audio");
    assert_eq!(video_json["type"], "video");
    assert_eq!(
        serde_json::from_value::<MediaFormat>(audio_json).expect("audio"),
        audio
    );
    assert_eq!(
        serde_json::from_value::<MediaFormat>(video_json).expect("video"),
        video
    );
}
