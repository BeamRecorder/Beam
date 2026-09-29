use beam_editor_domain::{
    Document, Edit, MediaAsset, Project,
    commands::{self, imports},
    protocol::RenderContext,
};
use uuid::Uuid;

fn context(document: &Document) -> RenderContext {
    RenderContext {
        project_id: document.project.id,
        sequence_id: document.active_sequence,
        expected_revision: document.revision,
        idempotency_key: "import".into(),
    }
}
fn asset(audio: bool) -> MediaAsset {
    let mut project = Project::new("Input".into());
    project.assets.push(crate::fixtures::asset(1000));
    crate::fixtures::source_identity(&mut project, b"real-source-identity");
    let mut asset = project.assets.remove(0);
    asset.path = format!("media/{}.webm", asset.id);
    if audio {
        asset.has_video = false;
        asset.has_audio = true;
        asset.width = 0;
        asset.height = 0;
    }
    asset
}

#[test]
fn multiple_sources_create_one_undo_and_one_honest_event_with_stable_ids() {
    let document = Document::new(Project::new("Import".into()));
    let scope = context(&document);
    let assets = vec![asset(false), asset(false), asset(true)];
    let source_ids: Vec<_> = assets.iter().map(|a| a.id).collect();
    let prepared = imports::prepare(&document, &scope, assets).unwrap();
    assert!(!prepared.replay);
    assert_eq!(prepared.document.revision, 1);
    assert_eq!(prepared.document.undo.len(), 1);
    assert_eq!(prepared.publication.asset_ids, source_ids);
    assert_eq!(prepared.document.project.canvas.width, 320);
    let clips: Vec<_> = prepared.document.project.clips.headers().collect();
    assert_eq!(
        clips.iter().map(|c| c.id).collect::<Vec<_>>(),
        prepared.publication.clip_ids
    );
    assert_eq!(
        clips.iter().map(|c| c.start_ms).collect::<Vec<_>>(),
        [0, 1000, 0]
    );
    assert!(prepared.document.receipts.is_empty());
    let events = commands::events::read(&prepared.document, 0, 256).unwrap();
    assert_eq!(events.items.len(), 1);
    assert!(events.items[0].command_ids.is_empty());
    let undo = commands::prepare(
        &prepared.document,
        &commands::single(&prepared.document, Edit::Undo {}),
    )
    .unwrap()
    .document;
    assert!(undo.project.clips.is_empty());
    assert_eq!(undo.project.assets.len(), 3);
    let redo = commands::prepare(&undo, &commands::single(&undo, Edit::Redo {}))
        .unwrap()
        .document;
    assert_eq!(
        redo.project
            .clips
            .headers()
            .map(|c| c.id)
            .collect::<Vec<_>>(),
        prepared.publication.clip_ids
    );
}

#[test]
fn stale_import_retry_survives_restart_and_uses_identity_order_without_copy_ids() {
    let document = Document::new(Project::new("Import".into()));
    let scope = context(&document);
    let first = asset(false);
    let identities = vec![first.identity.clone().unwrap()];
    assert!(
        imports::replay(&document, &scope, &identities)
            .unwrap()
            .is_none()
    );
    let prepared = imports::prepare(&document, &scope, vec![first]).unwrap();
    let changed = commands::prepare(
        &prepared.document,
        &commands::single(
            &prepared.document,
            Edit::Rename {
                name: "Changed".into(),
            },
        ),
    )
    .unwrap()
    .document;
    let root = tempfile::tempdir().unwrap();
    let store = beam_editor_domain::project::store::ProjectStore::lock(root.path()).unwrap();
    store.write(&changed).unwrap();
    let (loaded, _) = store.read().unwrap();
    let replay = imports::prepare(&loaded, &scope, vec![asset(false)]).unwrap();
    assert!(replay.replay);
    assert_eq!(replay.document, loaded);
    assert_eq!(replay.publication, prepared.publication);
    assert_eq!(
        imports::replay(&loaded, &scope, &identities).unwrap(),
        Some(prepared.publication)
    );
    let mut changed_identity = identities;
    changed_identity[0].sha256 = "b".repeat(64);
    assert!(imports::replay(&loaded, &scope, &changed_identity).is_err());
    let mut new_scope = scope;
    new_scope.idempotency_key = "new-import".into();
    assert!(matches!(
        imports::replay(&loaded, &new_scope, &changed_identity),
        Err(beam_editor_domain::EditorError::Conflict { .. })
    ));
}

#[test]
fn another_sequence_gets_the_import_history_and_event_without_changing_selection() {
    let document = Document::new(Project::new("Import".into()));
    let old_sequence = document.active_sequence;
    let switched = commands::prepare(
        &document,
        &commands::single(
            &document,
            Edit::AddSequence {
                name: "Other".into(),
            },
        ),
    )
    .unwrap()
    .document;
    let mut scope = context(&switched);
    scope.sequence_id = old_sequence;
    let prepared = imports::prepare(&switched, &scope, vec![asset(false)]).unwrap();
    assert_eq!(prepared.document.active_sequence, switched.active_sequence);
    assert!(prepared.document.project.clips.is_empty());
    assert_eq!(prepared.document.project.assets.len(), 1);
    assert_eq!(prepared.document.revision, 2);
    let target = prepared
        .document
        .sequences
        .iter()
        .find(|s| s.id == old_sequence)
        .unwrap();
    assert_eq!(target.state.clips.len(), 1);
    assert_eq!(target.undo.len(), 1);
    assert_eq!(
        commands::events::read(&prepared.document, 1, 1)
            .unwrap()
            .items[0]
            .sequence_id,
        old_sequence
    );
}

#[test]
fn invalid_context_sources_and_duplicate_assets_never_publish_partial_changes() {
    let document = Document::new(Project::new("Import".into()));
    let before = document.clone();
    for case in 0..10 {
        let mut scope = context(&document);
        let mut sources = vec![asset(false)];
        match case {
            0 => scope.project_id = Uuid::nil(),
            1 => scope.project_id = Uuid::new_v4(),
            2 => scope.sequence_id = Uuid::new_v4(),
            3 => scope.expected_revision = 1,
            4 => scope.idempotency_key.clear(),
            5 => scope.idempotency_key = "a".repeat(129),
            6 => scope.idempotency_key = "bad\0key".into(),
            7 => sources.clear(),
            8 => sources[0].identity = None,
            _ => sources[0].id = Uuid::nil(),
        }
        assert!(
            imports::prepare(&document, &scope, sources).is_err(),
            "case{case}"
        );
    }
    let source = asset(false);
    assert!(
        imports::prepare(&document, &context(&document), vec![source.clone(), source]).is_err()
    );
    assert!(
        imports::prepare(
            &document,
            &context(&document),
            (0..33).map(|_| asset(false)).collect()
        )
        .is_err()
    );
    let mut path = asset(false);
    path.path = "../outside.webm".into();
    assert!(imports::prepare(&document, &context(&document), vec![path]).is_err());
    let mut no_lane = document.clone();
    let id = no_lane.project.tracks.headers().next().unwrap().id;
    no_lane.project.tracks.try_remove(id).unwrap();
    beam_editor_domain::timeline::sequences::synchronize(&mut no_lane);
    assert!(imports::prepare(&no_lane, &context(&no_lane), vec![asset(false)]).is_err());
    let mut overflow = document.clone();
    overflow.revision = u64::MAX;
    assert!(imports::prepare(&overflow, &context(&overflow), vec![asset(false)]).is_err());
    assert_eq!(document, before);
}

#[test]
fn transaction_and_relink_cannot_reuse_import_keys_or_import_reuse_receipt_keys() {
    let document = Document::new(Project::new("Import".into()));
    let prepared = imports::prepare(&document, &context(&document), vec![asset(false)]).unwrap();
    let mut transaction = commands::single(
        &prepared.document,
        Edit::Rename {
            name: "Changed".into(),
        },
    );
    transaction.idempotency_key = "import".into();
    assert!(commands::prepare(&prepared.document, &transaction).is_err());
    let mut scope = context(&prepared.document);
    scope.idempotency_key = "import".into();
    let clip = prepared.publication.clip_ids[0];
    let old = prepared.publication.asset_ids[0];
    assert!(
        commands::assets::replay_relink(
            &prepared.document,
            &scope,
            old,
            &[clip],
            &asset(false).identity.unwrap()
        )
        .is_err()
    );
    transaction.idempotency_key = "edit".into();
    let edited = commands::prepare(&prepared.document, &transaction)
        .unwrap()
        .document;
    let mut scope = context(&edited);
    scope.idempotency_key = "edit".into();
    assert!(imports::prepare(&edited, &scope, vec![asset(false)]).is_err());
}

#[test]
fn corrupt_publication_metadata_is_rejected_and_expired_entries_are_bounded() {
    let document = Document::new(Project::new("Import".into()));
    let prepared = imports::prepare(&document, &context(&document), vec![asset(false)]).unwrap();
    for case in 0..9 {
        let mut corrupt = prepared.document.clone();
        let p = &mut corrupt.import_publications[0];
        match case {
            0 => p.project_id = Uuid::new_v4(),
            1 => p.sequence_id = Uuid::nil(),
            2 => p.revision = 0,
            3 => p.revision = 2,
            4 => p.fingerprint = "A".repeat(64),
            5 => p.clip_ids.clear(),
            6 => p.clip_ids[0] = p.asset_ids[0],
            7 => p.idempotency_key.clear(),
            _ => p.asset_ids[0] = Uuid::nil(),
        }
        assert!(imports::validate(&corrupt).is_err());
    }
    let mut document = prepared.document;
    for revision in 2..=129 {
        let mut p = document.import_publications[0].clone();
        p.revision = revision;
        p.idempotency_key = format!("import{revision}");
        document.import_publications.push(p);
        document.revision = revision;
    }
    assert!(imports::validate(&document).is_err());
    document.import_publications.remove(0);
    assert!(imports::validate(&document).is_ok());
    let mut scope = context(&document);
    scope.idempotency_key = "last".into();
    let prepared = imports::prepare(&document, &scope, vec![asset(false)]).unwrap();
    assert_eq!(prepared.document.import_publications.len(), 128);
    assert_eq!(prepared.document.import_publications[0].revision, 3);
}
