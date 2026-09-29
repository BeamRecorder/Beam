use beam_editor_domain::{
    Document,
    commands::source_jobs,
    protocol::{AnalysisAlgorithm, Container, ProxySettings, SourceContext},
    recording::{style_types::CursorMode, types::CursorInteractionType},
    timing::FrameRate,
};
use uuid::Uuid;

fn document() -> Document {
    let mut project = crate::fixtures::project();
    crate::fixtures::source_identity(&mut project, b"immutable source");
    project.assets[0].cursor_mode = CursorMode::Separated;
    project.assets[0].cursor = vec![crate::fixtures::point(
        1000,
        0.25,
        0.75,
        Some(CursorInteractionType::Click),
    )]
    .into();
    Document::new(project)
}
fn context(document: &Document) -> SourceContext {
    SourceContext {
        project_id: document.project.id,
        asset_id: document.project.assets[0].id,
        expected_revision: document.revision,
        idempotency_key: "source-job".into(),
    }
}
fn settings() -> ProxySettings {
    ProxySettings {
        container: Container::Webm,
        width: 128,
        height: 96,
        frame_rate: FrameRate {
            numerator: 30000,
            denominator: 1001,
        },
    }
}

#[test]
fn pin_preserves_immutable_telemetry_arcs_without_mutating_the_document() {
    let document = document();
    let before = document.clone();
    let asset = source_jobs::pin(&document, &context(&document)).unwrap();
    assert_eq!(asset, document.project.assets[0]);
    assert!(std::sync::Arc::ptr_eq(
        &asset.cursor,
        &document.project.assets[0].cursor
    ));
    assert_eq!(document, before);
}
#[test]
fn pin_rejects_stale_wrong_or_unidentified_sources() {
    let document = document();
    for case in 0..6 {
        let mut context = context(&document);
        match case {
            0 => context.project_id = Uuid::new_v4(),
            1 => context.asset_id = Uuid::new_v4(),
            2 => context.expected_revision = 1,
            3 => context.idempotency_key.clear(),
            4 => context.idempotency_key = "k".repeat(129),
            _ => context.idempotency_key = "k\0key".into(),
        }
        assert!(source_jobs::pin(&document, &context).is_err());
    }
    let mut broken = document;
    broken.project.assets[0].identity = None;
    assert!(source_jobs::pin(&broken, &context(&broken)).is_err());
}
#[test]
fn pin_validates_malformed_metadata_without_coercing_telemetry() {
    let mut document = document();
    document.project.assets[0].cursor = vec![crate::fixtures::point(10001, 0.5, 0.5, None)].into();
    assert!(source_jobs::pin(&document, &context(&document)).is_err());
}
#[test]
fn click_analysis_has_source_and_telemetry_provenance_and_never_rewrites_suggestions() {
    let document = document();
    let before = document.clone();
    let analysis = source_jobs::analyze(
        &document,
        &context(&document),
        AnalysisAlgorithm::ZoomClicksV1,
    )
    .unwrap();
    assert_eq!(analysis.suggestions.len(), 1);
    assert_eq!(analysis.suggestions[0].start_ms, 500);
    assert_eq!(analysis.suggestions[0].end_ms, 1500);
    assert_eq!(analysis.suggestions[0].scale, 1.5);
    assert_eq!(
        analysis.source_identity,
        document.project.assets[0].identity.clone().unwrap()
    );
    assert_eq!(analysis.telemetry_sha256.len(), 64);
    assert_eq!(analysis.revision, 0);
    assert_eq!(document, before);
    let again = source_jobs::analyze(
        &document,
        &context(&document),
        AnalysisAlgorithm::ZoomClicksV1,
    )
    .unwrap();
    assert_eq!(again, analysis);
}
#[test]
fn movements_without_clicks_produce_an_honest_empty_analysis() {
    let mut document = document();
    document.project.assets[0].cursor = vec![crate::fixtures::point(1000, 0.5, 0.5, None)].into();
    assert!(
        source_jobs::analyze(
            &document,
            &context(&document),
            AnalysisAlgorithm::ZoomClicksV1
        )
        .unwrap()
        .suggestions
        .is_empty()
    );
}
#[test]
fn click_analysis_refuses_missing_baked_or_unknown_telemetry() {
    for mode in [CursorMode::Absent, CursorMode::BakedIn, CursorMode::Unknown] {
        let mut document = document();
        document.project.assets[0].cursor_mode = mode;
        assert!(
            source_jobs::analyze(
                &document,
                &context(&document),
                AnalysisAlgorithm::ZoomClicksV1
            )
            .is_err()
        );
    }
    let mut document = document();
    document.project.assets[0].cursor = Default::default();
    assert!(
        source_jobs::analyze(
            &document,
            &context(&document),
            AnalysisAlgorithm::ZoomClicksV1
        )
        .is_err()
    );
}
#[test]
fn analysis_has_no_functional_limit_on_suggestion_count() {
    let mut document = document();
    document.project.assets[0].duration_ms = 21_600_000;
    document.project.assets[0].cursor = (0..4097)
        .map(|i| crate::fixtures::point(i * 3000, 0.5, 0.5, Some(CursorInteractionType::Click)))
        .collect::<Vec<_>>()
        .into();
    assert_eq!(
        source_jobs::analyze(
            &document,
            &context(&document),
            AnalysisAlgorithm::ZoomClicksV1
        )
        .unwrap()
        .suggestions
        .len(),
        4097
    );
}
#[test]
fn proxy_preserves_original_decisions_and_exports_only_the_full_source_at_explicit_cadence() {
    let mut document = document();
    crate::fixtures::clip_mut(&mut document.project, 0)
        .effects
        .brightness = 0.5;
    let definition =
        beam_editor_domain::effects::definition(&document.project.definitions, "beam.color", 1)
            .unwrap()
            .instantiate();
    crate::fixtures::clip_mut(&mut document.project, 0)
        .instances
        .push(definition);
    let before = document.clone();
    let proxy = source_jobs::proxy_project(&document, &context(&document), &settings()).unwrap();
    assert_eq!(proxy.assets, document.project.assets);
    assert_eq!(proxy.clips.len(), 1);
    let clip = crate::fixtures::clip(&proxy, 0);
    assert_eq!(clip.duration_ms, 10000);
    assert_eq!(clip.start_ms, 0);
    assert_eq!(clip.source_in_ms, 0);
    assert!(clip.instances.is_empty());
    assert!(clip.generator.is_none());
    assert!(!clip.effects.auto_zoom);
    assert_eq!(clip.effects.brightness, 0.);
    assert!(!proxy.recording_style.cursor.enabled);
    assert_eq!(
        (
            proxy.canvas.width,
            proxy.canvas.height,
            proxy.canvas.fps,
            proxy.canvas.fps_denominator
        ),
        (128, 96, 30000, 1001)
    );
    assert_eq!(document, before);
}
#[test]
fn proxy_rejects_nonvideo_and_still_images() {
    for image in [true, false] {
        let mut document = document();
        document.project.assets[0].is_image = image;
        if !image {
            document.project.assets[0].has_video = false;
            document.project.assets[0].has_audio = true;
        }
        assert!(source_jobs::proxy_project(&document, &context(&document), &settings()).is_err());
    }
}
#[test]
fn proxy_does_not_change_unsupported_dimensions_or_frame_rates() {
    let document = document();
    for case in 0..5 {
        let mut settings = settings();
        match case {
            0 => settings.width = 15,
            1 => settings.height = 4097,
            2 => settings.frame_rate.numerator = 0,
            3 => settings.frame_rate.denominator = 0,
            _ => {
                settings.frame_rate = FrameRate {
                    numerator: 241,
                    denominator: 1,
                }
            }
        }
        assert!(source_jobs::proxy_project(&document, &context(&document), &settings).is_err());
    }
}
