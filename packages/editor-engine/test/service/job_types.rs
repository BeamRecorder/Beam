use beam_editor_engine::{domain::protocol::*, service::job_types::JobRecord};
pub fn record(phase: JobPhase) -> JobRecord {
    let context = RenderContext {
        project_id: uuid::Uuid::new_v4(),
        sequence_id: uuid::Uuid::new_v4(),
        expected_revision: 7,
        idempotency_key: "restart".into(),
    };
    JobRecord {
        info: JobInfo {
            id: uuid::Uuid::new_v4(),
            project_id: context.project_id,
            scope: JobScope::Sequence {
                sequence_id: context.sequence_id,
            },
            revision: 7,
            kind: JobKind::Export {
                container: Container::Webm,
            },
            phase,
            progress: if phase == JobPhase::Queued { 0.0 } else { 0.4 },
            error: (phase == JobPhase::Failed).then(|| "render failed".into()),
            snapshot_id: (phase == JobPhase::Rendering).then(|| "a".repeat(64)),
            source_versions: Default::default(),
            artifacts: vec![],
        },
        context: JobContext::Sequence { context },
        fingerprint: "b".repeat(64),
        artifacts: vec![],
        import_publication: None,
    }
}
#[test]
fn durable_job_record_round_trips_strict_metadata() {
    let record = record(JobPhase::Failed);
    let value = serde_json::to_value(&record).unwrap();
    let decoded: JobRecord = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(decoded.info.id, record.info.id);
    let mut invalid = value;
    invalid["path"] = serde_json::json!("/arbitrary");
    assert!(serde_json::from_value::<JobRecord>(invalid).is_err());
}
