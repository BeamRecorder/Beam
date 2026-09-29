use super::job_types::record;
use beam_editor_engine::{domain::protocol::*, service::job_validation};

#[test]
fn phases_and_scope_cannot_claim_inconsistent_render_results() {
    for phase in [
        JobPhase::Queued,
        JobPhase::Rendering,
        JobPhase::Failed,
        JobPhase::Cancelled,
    ] {
        assert!(job_validation::record(&record(phase)).is_ok());
    }
    let valid = record(JobPhase::Rendering);
    let changes: [fn(&mut beam_editor_engine::service::job_types::JobRecord); 9] = [
        |value| value.info.id = uuid::Uuid::nil(),
        |value| {
            value.info.scope = JobScope::Sequence {
                sequence_id: uuid::Uuid::new_v4(),
            }
        },
        |value| {
            if let JobContext::Sequence { context } = &mut value.context {
                context.expected_revision += 1;
            }
        },
        |value| {
            if let JobContext::Sequence { context } = &mut value.context {
                context.idempotency_key = "\0".into();
            }
        },
        |value| value.fingerprint = "not a digest".into(),
        |value| value.info.progress = 1.01,
        |value| value.info.snapshot_id = None,
        |value| value.info.error = Some("failed while rendering".into()),
        |value| {
            value
                .info
                .source_versions
                .insert(
                    uuid::Uuid::nil(),
                    SourceVersion {
                        sha256: "a".repeat(64),
                        byte_length: 4,
                    },
                )
                .map(|_| ())
                .unwrap_or(())
        },
    ];
    for change in changes {
        let mut invalid = valid.clone();
        change(&mut invalid);
        assert!(job_validation::record(&invalid).is_err());
    }
    let mut preview = valid.clone();
    preview.info.kind = JobKind::Preview {
        time: beam_editor_engine::domain::timing::Time {
            ticks: 0,
            timescale: 0,
        },
        quality: RenderQuality::Full,
    };
    assert!(job_validation::record(&preview).is_err());
    let mut failed = record(JobPhase::Failed);
    failed.info.error = Some(" ".into());
    assert!(job_validation::record(&failed).is_err());
}

#[test]
fn completed_jobs_require_matching_opaque_artifact_metadata() {
    let mut valid = record(JobPhase::Completed);
    valid.info.progress = 1.0;
    valid.info.snapshot_id = Some("c".repeat(64));
    let artifact = ArtifactInfo {
        id: uuid::Uuid::new_v4(),
        job_id: valid.info.id,
        name: "movie.webm".into(),
        mime_type: "video/webm".into(),
        byte_length: 10,
        sha256: "d".repeat(64),
        width: 128,
        height: 96,
    };
    valid.info.artifacts.push(artifact.id);
    valid.artifacts.push(artifact);
    assert!(job_validation::record(&valid).is_ok());
    for field in 0..8 {
        let mut invalid = valid.clone();
        match field {
            0 => invalid.info.artifacts.clear(),
            1 => invalid.artifacts[0].job_id = uuid::Uuid::nil(),
            2 => invalid.artifacts[0].mime_type = "image/png".into(),
            3 => invalid.artifacts[0].name = "../movie.webm".into(),
            4 => invalid.artifacts[0].byte_length = 0,
            5 => invalid.artifacts[0].sha256 = "a".repeat(63),
            6 => invalid.artifacts[0].width = 0,
            _ => invalid.artifacts.push(invalid.artifacts[0].clone()),
        }
        assert!(job_validation::record(&invalid).is_err());
    }
}
