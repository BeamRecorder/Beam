use beam_editor_engine::{
    EditorController,
    domain::{
        commands::{import_types::ImportPublication, imports},
        project::types::SourceIdentity,
        protocol::*,
    },
    service::{EditorService, grants::GrantRegistry, job_types::JobRecord, job_validation},
};
use std::{path::Path, sync::Arc};
use uuid::Uuid;

pub(super) struct ImportOwner {
    pub controller: Arc<EditorController>,
    pub grants: Arc<GrantRegistry>,
    pub service: EditorService,
}

pub(super) fn read_record(root: &Path, id: Uuid) -> JobRecord {
    serde_json::from_slice(&std::fs::read(root.join(format!(".editor/jobs/{id}.json"))).unwrap())
        .unwrap()
}

pub(super) fn persist_record(root: &Path, record: &JobRecord) {
    job_validation::record(record).unwrap();
    std::fs::write(
        root.join(format!(".editor/jobs/{}.json", record.info.id)),
        serde_json::to_vec(record).unwrap(),
    )
    .unwrap();
}

fn candidate() -> JobRecord {
    let mut record = super::job_types::record(JobPhase::Rendering);
    record.info.kind = JobKind::Import { source_count: 2 };
    let asset_ids = vec![Uuid::new_v4(), Uuid::new_v4()];
    let sources = vec![
        SourceIdentity {
            sha256: "c".repeat(64),
            byte_length: 11,
        },
        SourceIdentity {
            sha256: "d".repeat(64),
            byte_length: 22,
        },
    ];
    record.info.source_versions = asset_ids
        .iter()
        .zip(&sources)
        .map(|(id, source)| {
            (
                *id,
                SourceVersion {
                    sha256: source.sha256.clone(),
                    byte_length: source.byte_length,
                },
            )
        })
        .collect();
    let JobContext::Sequence { context } = &record.context else {
        panic!("sequence context")
    };
    record.import_publication = Some(ImportPublication {
        project_id: context.project_id,
        sequence_id: context.sequence_id,
        revision: context.expected_revision + 1,
        idempotency_key: context.idempotency_key.clone(),
        fingerprint: imports::fingerprint(context, &sources).unwrap(),
        asset_ids,
        clip_ids: vec![Uuid::new_v4(), Uuid::new_v4()],
    });
    record
}

#[test]
fn import_candidates_round_trip_typed_publications_and_exact_ordered_source_versions() {
    let record = candidate();
    job_validation::record(&record).unwrap();
    let bytes = serde_json::to_value(&record).unwrap();
    let decoded: JobRecord = serde_json::from_value(bytes.clone()).unwrap();
    job_validation::record(&decoded).unwrap();
    assert_eq!(decoded.import_publication, record.import_publication);
    assert_eq!(decoded.info.source_versions, record.info.source_versions);
    assert_eq!(serde_json::to_value(&decoded).unwrap(), bytes);
    assert!(bytes.get("sources").is_none());
    assert!(bytes.get("paths").is_none());
    let mut unknown = bytes;
    unknown["authorizedSourcePath"] = serde_json::json!("/unmanaged/source.webm");
    assert!(serde_json::from_value::<JobRecord>(unknown).is_err());
}

#[test]
fn import_candidate_context_ids_source_count_and_fingerprint_must_all_agree() {
    let corruptions: [fn(&mut JobRecord); 12] = [
        |record| record.import_publication.as_mut().unwrap().project_id = Uuid::new_v4(),
        |record| record.import_publication.as_mut().unwrap().sequence_id = Uuid::new_v4(),
        |record| record.import_publication.as_mut().unwrap().revision += 1,
        |record| record.import_publication.as_mut().unwrap().idempotency_key = "other".into(),
        |record| record.import_publication.as_mut().unwrap().fingerprint = "a".repeat(64),
        |record| {
            record
                .import_publication
                .as_mut()
                .unwrap()
                .clip_ids
                .pop()
                .unwrap();
        },
        |record| {
            let publication = record.import_publication.as_mut().unwrap();
            publication.clip_ids[0] = publication.asset_ids[0];
        },
        |record| record.import_publication.as_mut().unwrap().asset_ids[0] = Uuid::nil(),
        |record| record.info.source_versions.clear(),
        |record| {
            record
                .info
                .source_versions
                .values_mut()
                .next()
                .unwrap()
                .byte_length += 1
        },
        |record| record.info.kind = JobKind::Import { source_count: 1 },
        |record| {
            record.info.kind = JobKind::Preview {
                time: beam_editor_engine::domain::timing::Time::ZERO,
                quality: RenderQuality::Full,
            }
        },
    ];
    for corrupt in corruptions {
        let mut record = candidate();
        corrupt(&mut record);
        assert!(job_validation::record(&record).is_err(), "{record:?}");
    }
}

#[test]
fn queued_and_completed_imports_cannot_claim_an_unpublished_candidate() {
    let mut record = candidate();
    record.info.phase = JobPhase::Queued;
    record.info.progress = 0.;
    record.info.snapshot_id = None;
    assert!(job_validation::record(&record).is_err());
    record = candidate();
    record.info.phase = JobPhase::Completed;
    record.info.progress = 1.;
    record.import_publication = None;
    assert!(job_validation::record(&record).is_err());
    for source_count in [0, imports::IMPORT_SOURCE_LIMIT + 1] {
        let mut record = super::job_types::record(JobPhase::Queued);
        record.info.kind = JobKind::Import { source_count };
        assert!(job_validation::record(&record).is_err());
    }
    let mut cancelled = candidate();
    cancelled.info.phase = JobPhase::Cancelled;
    job_validation::record(&cancelled).unwrap();
    assert!(cancelled.artifacts.is_empty());
}
