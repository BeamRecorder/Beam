use super::scale::{decisions, heap_bytes};
use beam_editor_domain::{
    Document, MediaAsset, Project, Track, TrackKind,
    animation::{Binding, Value},
    commands::{
        self,
        types::{Command, Operation, Reference, Transaction},
    },
    project::{store::ProjectStore, types::SourceIdentity},
};
use sha2::{Digest, Sha256};
use std::time::Instant;
use uuid::Uuid;

#[test]
fn fifty_real_parameter_transactions_checkpoint_ten_thousand_clips_without_whole_payload_clones() {
    let folder = std::env::var_os("BEAM_SCALE_TEMP_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let root = tempfile::Builder::new()
        .prefix(".beam-transactions-")
        .tempdir_in(folder)
        .unwrap();
    let mut project = Project::new("Dense transactions".into());
    project.clips = decisions(&project.definitions);
    let mut track = Track::new("Video".into(), TrackKind::Video);
    track.id = Uuid::from_u128(11_001);
    project.tracks = vec![track].into();
    let source = b"immutable-domain-scale-source";
    std::fs::create_dir(root.path().join("media")).unwrap();
    std::fs::write(root.path().join("media/source.webm"), source).unwrap();
    project.assets = vec![MediaAsset {
        id: Uuid::from_u128(11_000),
        name: "Source".into(),
        path: "media/source.webm".into(),
        identity: Some(SourceIdentity {
            sha256: format!("{:x}", Sha256::digest(source)),
            byte_length: source.len() as u64,
        }),
        duration_ms: 1000,
        width: 128,
        height: 96,
        has_video: true,
        has_audio: false,
        is_image: false,
        cursor: Default::default(),
        zooms: Default::default(),
        recording: false,
        cursor_mode: Default::default(),
    }];
    let mut document = Document::new(project);
    let store = ProjectStore::lock(root.path()).unwrap();
    let initial = Instant::now();
    document = store.write(&document).unwrap();
    let initial_checkpoint_ms = initial.elapsed().as_secs_f64() * 1000.;
    assert_eq!(document.project.clips.try_dirty_items().count(), 0);
    let original = document.project.clips.clone();
    let baseline = heap_bytes();
    let mut prepare_ms = 0.;
    let mut checkpoint_ms = 0.;
    for index in 0..50 {
        let clip_id = Uuid::from_u128(index + 1);
        let instance_id = document
            .project
            .clips
            .try_header_by_id(clip_id)
            .unwrap()
            .unwrap()
            .instances[0]
            .id;
        let request = Transaction {
            api_version: 1,
            project_id: document.project.id,
            sequence_id: document.active_sequence,
            expected_revision: document.revision,
            idempotency_key: format!("dense-{index}"),
            commands: vec![Command {
                command_id: "brightness".into(),
                operation: Operation::ParameterSet {
                    clip: Reference::Id(clip_id),
                    instance: Reference::Id(instance_id),
                    parameter: "brightness".into(),
                    binding: Binding::constant(Value::Number(0.75 + index as f64 / 1000.)),
                },
            }],
        };
        let start = Instant::now();
        let prepared = commands::prepare(&document, &request).unwrap();
        prepare_ms += start.elapsed().as_secs_f64() * 1000.;
        assert!(prepared.change.parameter_only);
        assert_eq!(prepared.change.affected_clips, vec![clip_id]);
        document = prepared.document;
        let start = Instant::now();
        document = store.write(&document).unwrap();
        checkpoint_ms += start.elapsed().as_secs_f64() * 1000.;
        assert_eq!(document.project.clips.try_dirty_items().count(), 0);
        assert!(
            document
                .undo
                .iter()
                .all(|history| history.clips.try_dirty_items().count() == 0)
        );
    }
    let history_bytes = heap_bytes() - baseline;
    assert!(
        history_bytes < 16 * 1024 * 1024,
        "transaction histories retained {history_bytes} bytes"
    );
    assert!(document.project.clips.shares_index(&original));
    assert!(document.project.clips.shares_identities(&original));
    let untouched = Uuid::from_u128(9999);
    assert!(std::sync::Arc::ptr_eq(
        &document
            .project
            .clips
            .try_by_id(untouched)
            .unwrap()
            .unwrap(),
        &original.try_by_id(untouched).unwrap().unwrap()
    ));
    let reopen = Instant::now();
    let (loaded, recovered) = store.read().unwrap();
    let reopen_ms = reopen.elapsed().as_secs_f64() * 1000.;
    assert!(!recovered);
    assert_eq!(loaded.revision, 50);
    assert_eq!(loaded.project.clips.loaded_pages(), 0);
    assert!(
        loaded
            .undo
            .iter()
            .all(|history| history.clips.loaded_pages() == 0)
    );
    assert_eq!(loaded.undo.len(), document.undo.len());
    let index: beam_editor_domain::project::block_types::DocumentIndex = serde_json::from_slice(
        &std::fs::read(
            root.path()
                .join(beam_editor_domain::project::types::DOCUMENT_FILE),
        )
        .unwrap(),
    )
    .unwrap();
    let historical_bytes = retained_history_bytes(root.path(), &index);
    assert!(historical_bytes <= beam_editor_domain::project::history_budget_types::HISTORY_BYTES);
    let report = serde_json::json!({"clips":10000,"instancesPerClip":100,"transactions":50,
        "retainedUndoStates":loaded.undo.len(),"retainedStatesIncludingCurrent":loaded.undo.len()+1,
        "historyBudgetBytes":beam_editor_domain::project::history_budget_types::HISTORY_BYTES,
        "retainedHistoricalDecisionAndIndexBytes":historical_bytes,
        "initialCheckpointMs":initial_checkpoint_ms,"fiftyPrepareMs":prepare_ms,"fiftyCheckpointMs":checkpoint_ms,
        "transactionHistoryAdditionalBytes":history_bytes,"reopenMs":reopen_ms,"loadedFxPagesAtReopen":0,
        "sharedIdIndexes":true,"untouchedClipPointerEqual":true,"dirtyItemsAfterEachCheckpoint":0});
    std::fs::write(
        "/tmp/beam-transaction-scale.json",
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
    println!("{report}");
}

fn retained_history_bytes(
    root: &std::path::Path,
    index: &beam_editor_domain::project::block_types::DocumentIndex,
) -> u64 {
    use beam_editor_domain::project::block_types::{CollectionIndex, StateIndex};
    use std::collections::HashSet;
    fn refs(state: &StateIndex, values: &mut HashSet<String>) {
        values.insert(state.transitions.clone());
        for collection in [&state.clips, &state.tracks] {
            match collection {
                CollectionIndex::Paged(pages) => {
                    for page in pages {
                        values.insert(page.headers.clone());
                        values.insert(page.values.clone());
                    }
                }
                CollectionIndex::LegacyHash(hash) => {
                    values.insert(hash.clone());
                }
                CollectionIndex::LegacyPages(hashes) => values.extend(hashes.iter().cloned()),
            }
        }
    }
    assert!(index.project_undo.is_empty() && index.project_redo.is_empty());
    let mut current = HashSet::new();
    let mut history = HashSet::new();
    let mut bytes = 0;
    for sequence in &index.sequences {
        refs(&sequence.state, &mut current);
        for state in sequence.undo.iter().chain(&sequence.redo) {
            refs(state, &mut history);
            bytes += serde_json::to_vec(state).unwrap().len() as u64;
        }
    }
    bytes
        + history
            .difference(&current)
            .map(|hash| {
                std::fs::metadata(root.join(".editor/blocks").join(format!("{hash}.json")))
                    .unwrap()
                    .len()
            })
            .sum::<u64>()
}
