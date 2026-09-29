use beam_editor_mcp::subscriptions::watch;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
#[test]
fn cancelled_subscription_acknowledges_without_polling() {
    let cancelled = Arc::new(AtomicBool::new(true));
    let mut output = Vec::new();
    watch(
        serde_json::json!(1),
        vec!["beam://project".into()],
        Arc::new(|_| panic!("cancelled watcher must not request")),
        cancelled,
        |value| output.push(value),
    );
    assert_eq!(output.len(), 1);
    assert_eq!(
        output[0]["params"]["_meta"]["io.modelcontextprotocol/subscriptionId"],
        1
    );
}
#[test]
fn subscribed_resource_changes_notify_and_cancel() {
    let cancelled = Arc::new(AtomicBool::new(false));
    let sequence = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let calls = sequence.clone();
    let executor = Arc::new(move |_| {
        let document =
            beam_editor_domain::Document::new(beam_editor_domain::Project::new("test".into()));
        Ok(beam_editor_domain::protocol::Response::Project {
            project: beam_editor_domain::protocol::ProjectInfo {
                id: document.project.id,
                name: "test".into(),
                revision: calls.fetch_add(1, Ordering::Relaxed),
                active_sequence: document.active_sequence,
                canvas: document.project.canvas,
                recording_style: document.project.recording_style,
                asset_count: 0,
                sequence_count: 1,
                can_undo: false,
                can_redo: false,
                can_project_undo: false,
                can_project_redo: false,
                recovered: false,
                warnings: vec![],
            },
        })
    });
    let stop = cancelled.clone();
    let mut output = Vec::new();
    watch(
        serde_json::json!(2),
        vec!["beam://project".into()],
        executor,
        cancelled,
        |value| {
            if value["method"] == "notifications/resources/updated" {
                stop.store(true, Ordering::Release);
            }
            output.push(value);
        },
    );
    assert_eq!(output.len(), 2);
    assert_eq!(output[1]["params"]["uri"], "beam://project");
}

#[test]
fn job_progress_and_artifact_metadata_notify_without_document_revision_changes() {
    use beam_editor_domain::{
        commands::types::Page,
        protocol::{ArtifactInfo, Container, JobInfo, JobKind, JobPhase, Request, Response},
    };
    for uri in ["beam://jobs", "beam://artifacts"] {
        let cancelled = Arc::new(AtomicBool::new(false));
        let calls = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let count = calls.clone();
        let executor = Arc::new(move |request| {
            let step = count.fetch_add(1, Ordering::Relaxed);
            let id = "00000000-0000-4000-8000-000000000001".parse().unwrap();
            Ok(match request {
                Request::Query {
                    query: beam_editor_domain::protocol::Query::Jobs { .. },
                } => Response::Jobs {
                    page: Page {
                        revision: 4,
                        total: 1,
                        next: None,
                        items: vec![JobInfo {
                            id,
                            project_id: id,
                            scope: beam_editor_domain::protocol::JobScope::Sequence {
                                sequence_id: id,
                            },
                            revision: 4,
                            kind: JobKind::Export {
                                container: Container::Webm,
                            },
                            phase: JobPhase::Rendering,
                            progress: step as f64,
                            error: None,
                            snapshot_id: None,
                            source_versions: Default::default(),
                            artifacts: vec![],
                        }],
                    },
                },
                Request::Query {
                    query: beam_editor_domain::protocol::Query::Artifacts { .. },
                } => Response::Artifacts {
                    page: Page {
                        revision: 4,
                        total: 1,
                        next: None,
                        items: vec![ArtifactInfo {
                            id,
                            job_id: id,
                            name: "frame.png".into(),
                            mime_type: "image/png".into(),
                            byte_length: step + 1,
                            sha256: "a".repeat(64),
                            width: 64,
                            height: 48,
                        }],
                    },
                },
                _ => panic!("unexpected subscription target"),
            })
        });
        let stop = cancelled.clone();
        let mut output = Vec::new();
        watch(
            serde_json::json!(3),
            vec![uri.into()],
            executor,
            cancelled,
            |value| {
                if value["method"] == "notifications/resources/updated" {
                    stop.store(true, Ordering::Release);
                }
                output.push(value);
            },
        );
        assert_eq!(output.len(), 2);
        assert_eq!(output[1]["params"]["uri"], uri);
        assert_eq!(calls.load(Ordering::Relaxed), 2);
    }
}
