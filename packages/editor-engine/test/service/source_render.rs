use base64::Engine;
use beam_editor_engine::{
    Document,
    domain::{protocol::*, recording::style_types::CursorMode, timing::FrameRate},
    service::{artifacts, source_render},
};
use std::sync::{Arc, atomic::AtomicBool};

pub fn recorded() -> Document {
    let mut project = crate::fixtures::project();
    project.assets[0].identity = Some(beam_editor_engine::domain::project::types::SourceIdentity {
        sha256: "a".repeat(64),
        byte_length: 100,
    });
    project.assets[0].cursor_mode = CursorMode::Separated;
    project.assets[0].cursor = vec![
        crate::fixtures::point(
            100,
            0.2,
            0.3,
            Some(beam_editor_engine::video::zoom::types::CursorInteractionType::Click),
        ),
        crate::fixtures::point(500, 0.4, 0.5, None),
    ]
    .into();
    Document::new(project)
}
pub fn scope(document: &Document) -> SourceContext {
    SourceContext {
        project_id: document.project.id,
        asset_id: document.project.assets[0].id,
        expected_revision: document.revision,
        idempotency_key: "source-analysis".into(),
    }
}
pub fn settings() -> ProxySettings {
    ProxySettings {
        container: Container::Webm,
        width: 128,
        height: 96,
        frame_rate: FrameRate {
            numerator: 30,
            denominator: 1,
        },
    }
}
#[test]
fn analysis_publishes_real_telemetry_suggestions_with_provenance_without_editing_the_document() {
    let root = tempfile::tempdir().unwrap();
    let document = recorded();
    let before = document.clone();
    let context = scope(&document);
    let id = uuid::Uuid::new_v4();
    let artifact = source_render::analyze(
        root.path(),
        &document,
        &context,
        AnalysisAlgorithm::ZoomClicksV1,
        id,
        &AtomicBool::new(false),
    )
    .unwrap()
    .unwrap();
    assert_eq!(
        (artifact.mime_type.as_str(), artifact.width, artifact.height),
        ("application/json", 0, 0)
    );
    assert_eq!(artifact.job_id, id);
    let data = artifacts::read(root.path(), &artifact, 0, ARTIFACT_CHUNK_BYTES).unwrap();
    let analysis: SourceAnalysis = serde_json::from_slice(
        &base64::engine::general_purpose::STANDARD
            .decode(data.data_base64)
            .unwrap(),
    )
    .unwrap();
    assert_eq!(analysis.asset_id, context.asset_id);
    assert_eq!(analysis.revision, context.expected_revision);
    assert!(!analysis.suggestions.is_empty());
    assert_eq!(
        analysis.source_identity,
        document.project.assets[0].identity.clone().unwrap()
    );
    assert_eq!(analysis.telemetry_sha256.len(), 64);
    assert_eq!(document, before);
}
#[test]
fn cancelled_source_derivatives_publish_no_directories_or_resources() {
    let root = tempfile::tempdir().unwrap();
    let document = recorded();
    let cancel = Arc::new(AtomicBool::new(true));
    assert!(
        source_render::analyze(
            root.path(),
            &document,
            &scope(&document),
            AnalysisAlgorithm::ZoomClicksV1,
            uuid::Uuid::new_v4(),
            &cancel
        )
        .unwrap()
        .is_none()
    );
    assert!(
        source_render::proxy(
            root.path(),
            &document.project,
            &settings(),
            uuid::Uuid::new_v4(),
            &cancel,
            |_| {}
        )
        .unwrap()
        .is_none()
    );
    assert!(!root.path().join(".editor").exists());
}
#[test]
fn analysis_rejects_stale_context_and_missing_separated_telemetry_before_publication() {
    let root = tempfile::tempdir().unwrap();
    let mut document = recorded();
    let mut context = scope(&document);
    context.expected_revision += 1;
    assert!(
        source_render::analyze(
            root.path(),
            &document,
            &context,
            AnalysisAlgorithm::ZoomClicksV1,
            uuid::Uuid::new_v4(),
            &AtomicBool::new(false)
        )
        .is_err()
    );
    context = scope(&document);
    document.project.assets[0].cursor_mode = CursorMode::BakedIn;
    assert!(
        source_render::analyze(
            root.path(),
            &document,
            &context,
            AnalysisAlgorithm::ZoomClicksV1,
            uuid::Uuid::new_v4(),
            &AtomicBool::new(false)
        )
        .is_err()
    );
    assert!(!root.path().join(".editor").exists());
}
#[test]
#[ignore = "requires actual OpenGL composition and hardware VP9 encoding"]
fn proxy_encodes_the_full_source_at_exact_requested_dimensions_and_cleans_temporary_output() {
    let root = tempfile::tempdir().unwrap();
    let media = tempfile::tempdir().unwrap();
    let controller = beam_editor_engine::EditorController::new().unwrap();
    controller
        .create(root.path().into(), "Proxy".into())
        .unwrap();
    controller
        .import(vec![crate::fixtures::media(
            media.path(),
            "proxy-source.webm",
            true,
        )])
        .unwrap();
    let document = controller.document().unwrap();
    let before = document.clone();
    let settings = settings();
    let project = beam_editor_engine::domain::commands::source_jobs::proxy_project(
        &document,
        &scope(&document),
        &settings,
    )
    .unwrap();
    let artifact = source_render::proxy(
        root.path(),
        &project,
        &settings,
        uuid::Uuid::new_v4(),
        &Arc::new(AtomicBool::new(false)),
        |_| {},
    )
    .unwrap()
    .unwrap();
    assert_eq!((artifact.width, artifact.height), (128, 96));
    assert_eq!(artifact.mime_type, "video/webm");
    let folder = root.path().join(".editor/artifacts");
    assert_eq!(std::fs::read_dir(&folder).unwrap().count(), 1);
    let path = folder.join(format!("{}.bin", artifact.id));
    let rendered = beam_editor_engine::video::probe::discover(&path).unwrap();
    assert_eq!((rendered.width, rendered.height), (128, 96));
    assert!(rendered.has_video && rendered.has_audio);
    assert_eq!(controller.document().unwrap(), before);
}
