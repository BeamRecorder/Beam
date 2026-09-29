use beam_editor_domain::{
    Document, Edit, MediaAsset,
    commands::{self, assets},
    protocol::RenderContext,
    recording::style_types::CursorMode,
};
use uuid::Uuid;

fn fixture() -> Document {
    let mut project = crate::fixtures::project();
    crate::fixtures::source_identity(&mut project, b"immutable original");
    project.assets[0].recording = true;
    project.assets[0].cursor_mode = CursorMode::Separated;
    project.assets[0].cursor = vec![crate::fixtures::point(500, 0.25, 0.75, None)].into();
    let color = beam_editor_domain::effects::definition(&project.definitions, "beam.color", 1)
        .unwrap()
        .instantiate();
    crate::fixtures::clip_mut(&mut project, 0)
        .instances
        .push(color);
    Document::new(project)
}
fn context(document: &Document) -> RenderContext {
    RenderContext {
        project_id: document.project.id,
        sequence_id: document.active_sequence,
        expected_revision: document.revision,
        idempotency_key: "source-version".into(),
    }
}
fn replacement(document: &Document, same: bool) -> MediaAsset {
    let mut asset = document.project.assets[0].clone();
    asset.id = Uuid::new_v4();
    asset.path = format!("media/{}.webm", asset.id);
    asset.recording = false;
    asset.cursor_mode = CursorMode::Unknown;
    asset.cursor = Default::default();
    asset.zooms = Default::default();
    if !same {
        let mut temporary = beam_editor_domain::Project::new("Replacement".into());
        temporary.assets.push(asset);
        crate::fixtures::source_identity(&mut temporary, b"changed replacement");
        asset = temporary.assets.remove(0);
    }
    asset
}

#[test]
fn same_bytes_create_a_distinct_source_version_preserving_telemetry_fx_and_undo() {
    let document = fixture();
    let scope = context(&document);
    let previous = document.project.assets[0].id;
    let id = crate::fixtures::clip(&document.project, 0).id;
    let source = replacement(&document, true);
    let new_id = source.id;
    let prepared = assets::prepare_relink(&document, &scope, previous, &[id], source).unwrap();
    assert_eq!(prepared.document.project.assets.len(), 2);
    assert_eq!(
        prepared.document.project.assets[0],
        document.project.assets[0]
    );
    let replacement = &prepared.document.project.assets[1];
    assert!(replacement.recording);
    assert_eq!(replacement.cursor_mode, CursorMode::Separated);
    assert!(std::sync::Arc::ptr_eq(
        &replacement.cursor,
        &document.project.assets[0].cursor
    ));
    assert!(std::sync::Arc::ptr_eq(
        &replacement.zooms,
        &document.project.assets[0].zooms
    ));
    let changed = crate::fixtures::clip(&prepared.document.project, 0);
    assert_eq!(changed.asset_id, new_id);
    assert_eq!(
        changed.instances,
        crate::fixtures::clip(&document.project, 0).instances
    );
    assert_eq!(prepared.receipt.results[0].created[0], new_id);
    assert_eq!(prepared.document.revision, 1);
    assert_eq!(prepared.document.undo.len(), 1);
    assert_eq!(
        commands::events::read(&prepared.document, 0, 1)
            .unwrap()
            .items[0]
            .command_ids,
        vec!["relink"]
    );
    let undo = commands::prepare(
        &prepared.document,
        &commands::single(&prepared.document, Edit::Undo {}),
    )
    .unwrap()
    .document;
    assert_eq!(crate::fixtures::clip(&undo.project, 0).asset_id, previous);
    assert_eq!(undo.project.assets.len(), 2);
    let redo = commands::prepare(&undo, &commands::single(&undo, Edit::Redo {}))
        .unwrap()
        .document;
    assert_eq!(crate::fixtures::clip(&redo.project, 0).asset_id, new_id);
    assert_eq!(redo.project.assets.len(), 2);
}

#[test]
fn replay_survives_checkpoint_and_ignores_new_grants_or_managed_copy_uuids() {
    let document = fixture();
    let scope = context(&document);
    let previous = document.project.assets[0].id;
    let id = crate::fixtures::clip(&document.project, 0).id;
    let source = replacement(&document, false);
    let identity = source.identity.clone().unwrap();
    assert!(
        assets::replay_relink(&document, &scope, previous, &[id], &identity)
            .unwrap()
            .is_none()
    );
    let prepared = assets::prepare_relink(&document, &scope, previous, &[id], source).unwrap();
    assert_eq!(
        prepared.document.project.assets[1].cursor_mode,
        CursorMode::Absent
    );
    let root = tempfile::tempdir().unwrap();
    let store = beam_editor_domain::project::store::ProjectStore::lock(root.path()).unwrap();
    store.write(&prepared.document).unwrap();
    let (loaded, _) = store.read().unwrap();
    assert_eq!(
        assets::replay_relink(&loaded, &scope, previous, &[id], &identity)
            .unwrap()
            .unwrap(),
        prepared.receipt
    );
    let replay = assets::prepare_relink(
        &loaded,
        &scope,
        previous,
        &[id],
        replacement(&document, false),
    )
    .unwrap();
    assert!(replay.replay);
    assert_eq!(replay.receipt, prepared.receipt);
    assert_eq!(replay.document, loaded);
    let mut different = identity;
    different.sha256 = "a".repeat(64);
    assert!(assets::replay_relink(&loaded, &scope, previous, &[id], &different).is_err());
}

#[test]
fn invalid_context_targets_media_and_missing_identity_publish_nothing() {
    let document = fixture();
    let scope = context(&document);
    let previous = document.project.assets[0].id;
    let id = crate::fixtures::clip(&document.project, 0).id;
    let before = document.clone();
    for case in 0..8 {
        let mut context = scope.clone();
        let mut old = previous;
        let mut clips = vec![id];
        match case {
            0 => context.project_id = Uuid::new_v4(),
            1 => context.sequence_id = Uuid::new_v4(),
            2 => context.expected_revision = 99,
            3 => context.idempotency_key.clear(),
            4 => old = Uuid::new_v4(),
            5 => clips.clear(),
            6 => clips.push(id),
            _ => clips[0] = Uuid::new_v4(),
        }
        assert!(
            assets::prepare_relink(
                &document,
                &context,
                old,
                &clips,
                replacement(&document, false)
            )
            .is_err()
        );
    }
    for case in 0..5 {
        let mut source = replacement(&document, false);
        match case {
            0 => source.id = previous,
            1 => source.identity = None,
            2 => source.duration_ms = 5000,
            3 => {
                source.has_video = false;
                source.has_audio = true;
                source.width = 0;
                source.height = 0;
            }
            _ => source.path = "../outside.webm".into(),
        }
        assert!(
            assets::prepare_relink(&document, &scope, previous, &[id], source).is_err(),
            "case {case}"
        );
    }
    assert_eq!(document, before);
}

#[test]
fn linked_groups_require_every_explicit_target_and_sequence_scope_is_preserved() {
    let mut document = fixture();
    document.project.assets[0].has_audio = true;
    let mut audio = (*crate::fixtures::clip(&document.project, 0)).clone();
    audio.id = Uuid::new_v4();
    audio.track_id = document.project.tracks.headers().nth(1).unwrap().id;
    audio.instances.clear();
    document.project.clips.try_push(audio).unwrap();
    let clips: Vec<_> = document
        .project
        .clips
        .headers()
        .map(|clip| clip.id)
        .collect();
    beam_editor_domain::timeline::links::link(&mut document.project, &clips).unwrap();
    beam_editor_domain::timeline::sequences::synchronize(&mut document);
    let old_sequence = document.active_sequence;
    let previous = document.project.assets[0].id;
    let old_group = crate::fixtures::clip(&document.project, 0).link_group;
    let scope = context(&document);
    assert!(
        assets::prepare_relink(
            &document,
            &scope,
            previous,
            &clips[..1],
            replacement(&document, false)
        )
        .is_err()
    );
    let prepared = assets::prepare_relink(
        &document,
        &scope,
        previous,
        &clips,
        replacement(&document, false),
    )
    .unwrap();
    assert!(
        prepared
            .document
            .project
            .clips
            .headers()
            .all(|clip| clip.link_group == old_group
                && clip.asset_id == prepared.document.project.assets[1].id)
    );
    let switched = commands::prepare(
        &document,
        &commands::single(
            &document,
            Edit::AddSequence {
                name: "Other sequence".into(),
            },
        ),
    )
    .unwrap()
    .document;
    let mut scoped = context(&switched);
    scoped.sequence_id = old_sequence;
    let changed = assets::prepare_relink(
        &switched,
        &scoped,
        previous,
        &clips,
        replacement(&switched, false),
    )
    .unwrap()
    .document;
    assert_eq!(changed.active_sequence, switched.active_sequence);
    assert!(changed.project.clips.is_empty());
    let targeted = changed
        .sequences
        .iter()
        .find(|sequence| sequence.id == old_sequence)
        .unwrap();
    assert_eq!(targeted.undo.len(), 1);
    assert!(
        targeted
            .state
            .clips
            .headers()
            .all(|clip| clip.asset_id == changed.project.assets[1].id)
    );
}
