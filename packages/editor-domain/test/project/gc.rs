use beam_editor_domain::{
    Document, Edit,
    project::{blocks, store::ProjectStore},
    timeline::history,
};
fn document(root: &std::path::Path) -> Document {
    let mut project = crate::fixtures::project();
    crate::fixtures::source_identity(&mut project, b"original");
    std::fs::create_dir(root.join("media")).unwrap();
    std::fs::write(root.join("media/source.webm"), b"original").unwrap();
    Document::new(project)
}
fn path(root: &std::path::Path, hash: &str) -> std::path::PathBuf {
    root.join(format!(".editor/blocks/{hash}.json"))
}

#[test]
fn collection_preserves_history_recovery_job_pins_and_sources_without_loading_fx() {
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let original = document(root.path());
    store.write(&original).unwrap();
    let mut effects = crate::fixtures::clip(&original.project, 0).effects.clone();
    effects.opacity = 0.5;
    let changed = history::edited(
        &original,
        &Edit::Effects {
            id: crate::fixtures::clip(&original.project, 0).id,
            effects,
        },
    )
    .unwrap();
    store.write(&changed).unwrap();
    let mut pinned = original.clone();
    crate::fixtures::clip_mut(&mut pinned.project, 0)
        .effects
        .opacity = 0.8;
    beam_editor_domain::timeline::sequences::synchronize(&mut pinned);
    let pinned_index = blocks::index(root.path(), &pinned).unwrap();
    let pin = blocks::put(root.path(), &pinned_index).unwrap();
    let orphan = blocks::put(root.path(), &vec!["unreachable", "decision"]).unwrap();
    let (loaded, _) = store.read().unwrap();
    assert_eq!(loaded.project.clips.loaded_pages(), 0);
    let result = store.garbage_collect(std::slice::from_ref(&pin)).unwrap();
    assert_eq!(result.removed_blocks, 1);
    assert!(result.freed_bytes > 0);
    assert!(!path(root.path(), &orphan).exists());
    assert_eq!(loaded.project.clips.loaded_pages(), 0);
    assert_eq!(store.read().unwrap().0, changed);
    assert_eq!(blocks::load(root.path(), pinned_index).unwrap(), pinned);
    assert!(path(root.path(), &pin).exists());
    assert_eq!(
        std::fs::read(root.path().join("media/source.webm")).unwrap(),
        b"original"
    );
    assert_eq!(store.garbage_collect(&[pin]).unwrap().removed_blocks, 0);
}

#[test]
fn missing_or_tampered_live_blocks_abort_before_removing_unreachable_content() {
    for missing in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let store = ProjectStore::lock(root.path()).unwrap();
        let value = document(root.path());
        store.write(&value).unwrap();
        let index = blocks::index(root.path(), &value).unwrap();
        let live = path(root.path(), &index.definitions);
        if missing {
            std::fs::remove_file(live).unwrap();
        } else {
            std::fs::write(live, b"tampered").unwrap();
        }
        let orphan = blocks::put(root.path(), &"retain until recovery").unwrap();
        assert!(store.garbage_collect(&[]).is_err());
        assert!(path(root.path(), &orphan).exists());
    }
}

#[test]
fn unknown_entries_external_checkpoints_and_invalid_pins_do_not_trigger_a_sweep() {
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    store.write(&document(root.path())).unwrap();
    let orphan = blocks::put(root.path(), &"unreachable").unwrap();
    assert!(store.garbage_collect(&["../escape".into()]).is_err());
    let stray = root.path().join(".editor/blocks/stray");
    std::fs::write(&stray, b"unexpected").unwrap();
    assert!(store.garbage_collect(&[]).is_err());
    std::fs::remove_file(stray).unwrap();
    std::fs::write(root.path().join("editor.beam.json"), b"{} ").unwrap();
    assert!(store.garbage_collect(&[]).is_err());
    assert!(path(root.path(), &orphan).exists());
}

#[test]
fn sequence_effect_blocks_survive_collection_in_current_and_undo_states() {
    use beam_editor_domain::{
        Project,
        animation::{Binding, Value},
        commands::{
            self,
            scope_types::{ScopeAddress, ScopedAction},
            types::{Command, Operation, Reference},
        },
        effects::definition,
    };
    let root = tempfile::tempdir().unwrap();
    let store = ProjectStore::lock(root.path()).unwrap();
    let mut project = Project::new("Sequence blocks".into());
    let instance = definition(&project.definitions, "beam.opacity", 2)
        .unwrap()
        .instantiate();
    let id = instance.id;
    project.sequence_instances.push(instance);
    let original = Document::new(project);
    store.write(&original).unwrap();
    let mut transaction = commands::single(&original, Edit::Undo {});
    transaction.commands = vec![Command {
        command_id: "opacity".into(),
        operation: Operation::ScopedEffect {
            target: ScopeAddress::Sequence {
                sequence_id: original.active_sequence,
            },
            action: ScopedAction::ParameterSet {
                instance: Reference::Id(id),
                parameter: "opacity".into(),
                binding: Binding::constant(Value::Number(0.5)),
            },
        },
    }];
    let changed = commands::prepare(&original, &transaction).unwrap().document;
    store.write(&changed).unwrap();
    let current = blocks::index(root.path(), &changed).unwrap();
    let current_hash = current.sequences[0]
        .state
        .sequence_instances
        .as_ref()
        .unwrap();
    let old_hash = current.sequences[0].undo[0]
        .sequence_instances
        .as_ref()
        .unwrap();
    assert_ne!(current_hash, old_hash);
    let orphan = blocks::put(root.path(), &"scope orphan").unwrap();
    store.garbage_collect(&[]).unwrap();
    assert!(path(root.path(), current_hash).exists() && path(root.path(), old_hash).exists());
    assert!(!path(root.path(), &orphan).exists());
    let (loaded, _) = store.read().unwrap();
    let undone = commands::prepare(&loaded, &commands::single(&loaded, Edit::Undo {})).unwrap();
    assert_eq!(
        undone.document.project.sequence_instances,
        original.project.sequence_instances
    );
}

#[cfg(unix)]
#[test]
fn symlinked_managed_directories_and_blocks_are_never_read_or_written() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join(".editor")).unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join(".editor/blocks")).unwrap();
    assert!(blocks::put(root.path(), &"data").is_err());
    assert_eq!(std::fs::read_dir(outside.path()).unwrap().count(), 0);
    std::fs::remove_file(root.path().join(".editor/blocks")).unwrap();
    let hash = blocks::put(root.path(), &"payload").unwrap();
    let external = outside.path().join("payload");
    std::fs::rename(path(root.path(), &hash), &external).unwrap();
    std::os::unix::fs::symlink(&external, path(root.path(), &hash)).unwrap();
    assert!(blocks::get::<String>(root.path(), &hash).is_err());
    assert!(blocks::put(root.path(), &"payload").is_err());
    assert_eq!(std::fs::read(&external).unwrap(), b"\"payload\"");
}
