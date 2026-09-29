use super::effects::types::Render;
use ges::prelude::*;

#[test]
fn source_decoders_use_the_sample_clock_without_packet_loss_concealment() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let project = super::transitions::project(root.path(), media.path());
        let render = Render::new(root.path(), &project);
        render.image(1000);
        let decoders = render
            .pipeline
            .iterate_recurse()
            .into_iter()
            .flatten()
            .filter(|e| {
                e.factory().is_some_and(|f| {
                    f.metadata("klass")
                        .is_some_and(|c| c.contains("Decoder/Audio"))
                })
            })
            .collect::<Vec<_>>();
        assert!(!decoders.is_empty());
        for decoder in decoders {
            assert_eq!(decoder.property::<i64>("tolerance"), 2_000_000);
            assert!(
                !decoder.property::<bool>("plc"),
                "decoded samples cannot be replaced by packet-loss concealment"
            );
        }
    });
}

#[test]
fn timeline_audio_is_mixed_at_float_48k_before_sink_conversion() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let media = tempfile::tempdir().unwrap();
        let project = super::transitions::project(root.path(), media.path());
        let render = Render::new(root.path(), &project);
        let audio = render
            .pipeline
            .timeline()
            .unwrap()
            .tracks()
            .into_iter()
            .find(|t| t.track_type() == ges::TrackType::AUDIO)
            .unwrap();
        let caps = audio.restriction_caps().unwrap();
        let structure = caps.structure(0).unwrap();
        assert_eq!(structure.get::<String>("format").unwrap(), "F32LE");
        assert_eq!(structure.get::<i32>("rate").unwrap(), 48_000);
        assert_eq!(structure.get::<i32>("channels").unwrap(), 2);
    });
}

#[test]
fn video_only_artwork_does_not_acquire_an_audio_decoder_or_track() {
    crate::fixtures::context(|| {
        let root = tempfile::tempdir().unwrap();
        let project = super::effects::project();
        let render = Render::new(root.path(), &project);
        assert!(
            render
                .pipeline
                .timeline()
                .unwrap()
                .tracks()
                .iter()
                .all(|t| t.track_type() != ges::TrackType::AUDIO)
        );
        assert!(
            render
                .pipeline
                .iterate_recurse()
                .into_iter()
                .flatten()
                .all(|e| !e.factory().is_some_and(|f| f
                    .metadata("klass")
                    .is_some_and(|c| c.contains("Decoder/Audio"))))
        );
    });
}
