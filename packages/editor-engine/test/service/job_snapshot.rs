use beam_editor_engine::{Document, Project, domain::protocol::*, service::job_snapshot};
use std::sync::atomic::AtomicBool;
pub fn context(document: &Document) -> RenderContext {
    RenderContext {
        project_id: document.project.id,
        sequence_id: document.active_sequence,
        expected_revision: document.revision,
        idempotency_key: "render-once".into(),
    }
}
pub fn kind() -> JobKind {
    JobKind::Preview {
        time: beam_editor_engine::domain::timing::Time {
            ticks: 500,
            timescale: 1000,
        },
        quality: RenderQuality::Full,
    }
}
#[test]
fn render_scope_rejects_wrong_project_sequence_and_stale_revision() {
    let document = Document::new(crate::fixtures::project());
    let original = context(&document);
    let mut invalid = original.clone();
    invalid.project_id = uuid::Uuid::new_v4();
    assert!(job_snapshot::select(&document, &invalid, &kind()).is_err());
    invalid = original.clone();
    invalid.sequence_id = uuid::Uuid::new_v4();
    assert!(job_snapshot::select(&document, &invalid, &kind()).is_err());
    invalid = original;
    invalid.expected_revision = 10;
    assert!(matches!(
        job_snapshot::select(&document, &invalid, &kind()),
        Err(beam_editor_engine::EditorError::Conflict { .. })
    ));
}
#[test]
fn preview_requires_nonempty_half_open_and_valid_rational_time() {
    let document = Document::new(crate::fixtures::project());
    for time in [
        beam_editor_engine::domain::timing::Time {
            ticks: -1,
            timescale: 1000,
        },
        beam_editor_engine::domain::timing::Time {
            ticks: 10000,
            timescale: 1000,
        },
        beam_editor_engine::domain::timing::Time {
            ticks: 1,
            timescale: 0,
        },
    ] {
        assert!(
            job_snapshot::select(
                &document,
                &context(&document),
                &JobKind::Preview {
                    time,
                    quality: RenderQuality::Full
                }
            )
            .is_err()
        );
    }
    let empty = Document::new(Project::new("Empty".into()));
    assert!(job_snapshot::select(&empty, &context(&empty), &kind()).is_err());
}
#[test]
fn versions_are_real_source_hashes_and_the_frozen_project_is_independent() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("media")).unwrap();
    std::fs::write(
        root.path().join("media/source.webm"),
        b"immutable source bytes",
    )
    .unwrap();
    let mut document = Document::new(crate::fixtures::project());
    let frozen = job_snapshot::select(&document, &context(&document), &kind()).unwrap();
    crate::fixtures::clip_mut(&mut document.project, 0).duration_ms = 2000;
    assert_eq!(crate::fixtures::clip(&frozen, 0).duration_ms, 10000);
    let before = job_snapshot::sources(root.path(), &frozen, &AtomicBool::new(false)).unwrap();
    assert_eq!(before.values().next().unwrap().byte_length, 22);
    std::fs::write(
        root.path().join("media/source.webm"),
        b"changed source bytes!!",
    )
    .unwrap();
    let after = job_snapshot::sources(root.path(), &frozen, &AtomicBool::new(false)).unwrap();
    assert_ne!(before, after);
}
