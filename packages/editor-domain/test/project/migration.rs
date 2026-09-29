use beam_editor_domain::{
    Document, EditState, Project,
    animation::Value,
    effects::definition,
    project::{migration, types::DOCUMENT_VERSION},
    recording::types::Zoom,
    timeline::{project_history_types::ProjectAction, sequence_types::Sequence},
    timing::Time,
};

fn scalar_legacy() -> Document {
    let mut project = crate::fixtures::project();
    project
        .definitions
        .retain(|definition| definition.version == 1);
    project.presets.retain(|preset| preset.version == 1);
    project.assets[0].has_audio = true;
    project.assets[0].recording = true;
    project.assets[0].cursor = vec![crate::fixtures::point(1200, 0.25, 0.75, None)].into();
    project.assets[0].zooms = vec![Zoom {
        start_ms: 1000,
        end_ms: 4000,
        cx: 0.4,
        cy: 0.6,
        scale: 2.,
    }]
    .into();
    crate::fixtures::source_identity(&mut project, b"legacy-scalar-source");
    let mut existing = definition(&project.definitions, "beam.opacity", 1)
        .unwrap()
        .instantiate();
    existing.name = Some("Existing occurrence".into());
    existing.enabled = false;
    let mut clip = crate::fixtures::clip_mut(&mut project, 0);
    clip.start_ms = 500;
    clip.source_in_ms = 1000;
    clip.duration_ms = 5000;
    clip.animation_offset_ms = 125;
    clip.effects.brightness = 0.12;
    clip.effects.saturation = 0.65;
    clip.effects.opacity = 0.8;
    clip.effects.volume = 0.7;
    clip.effects.scale = 0.7;
    clip.effects.x = 0.23;
    clip.effects.y = 0.72;
    clip.effects.fade_in_ms = 600;
    clip.effects.fade_out_ms = 900;
    clip.instances.push(existing);
    drop(clip);
    let mut document = Document::new(project);
    document.schema_version = 1;
    let state = EditState::capture(&document.project);
    document.undo.push(state.clone());
    document.redo.push(state.clone());
    document.sequences.push(Sequence {
        id: uuid::Uuid::new_v4(),
        name: "Other".into(),
        state: state.clone(),
        undo: vec![state.clone()],
        redo: vec![state.clone()],
    });
    let deleted = Sequence {
        id: uuid::Uuid::new_v4(),
        name: "Deleted".into(),
        state: state.clone(),
        undo: vec![state.clone()],
        redo: vec![state],
    };
    document.project_undo.push(ProjectAction::InsertSequence {
        sequence: Box::new(deleted),
        index: 1,
        active: document.active_sequence,
    });
    beam_editor_domain::timeline::sequences::synchronize(&mut document);
    document
}

#[test]
fn legacy_document_migrates_decisions_and_preserves_source_telemetry() {
    let mut legacy = Document::new(crate::fixtures::project());
    legacy.schema_version = 1;
    legacy.project.assets[0].cursor =
        std::sync::Arc::new(vec![crate::fixtures::point(120, 0.25, 0.75, None)]);
    legacy.project.assets[0].recording = true;
    let before_assets = legacy.project.assets.clone();
    let migrated = migration::migrate(legacy).unwrap();
    assert_eq!(migrated.schema_version, DOCUMENT_VERSION);
    assert_eq!(migrated.project.assets, before_assets);
    assert!(migrated.undo.is_empty());
    assert!(migrated.redo.is_empty());
}

#[test]
fn future_and_zero_schema_versions_are_rejected_without_fallback() {
    let mut future = Document::new(Project::new("future".into()));
    future.schema_version = DOCUMENT_VERSION + 1;
    assert!(matches!(
        migration::migrate(future),
        Err(beam_editor_domain::EditorError::UnsupportedVersion(_))
    ));
    let mut zero = Document::new(Project::new("zero".into()));
    zero.schema_version = 0;
    assert!(matches!(
        migration::migrate(zero),
        Err(beam_editor_domain::EditorError::UnsupportedVersion(0))
    ));
}

#[test]
fn migration_keeps_independent_sequences_and_the_selected_state() {
    let document = Document::new(Project::new("multi".into()));
    let mut legacy = document.clone();
    legacy.schema_version = 1;
    let migrated = migration::migrate(legacy).unwrap();
    assert_eq!(migrated.active_sequence, document.active_sequence);
    assert_eq!(migrated.sequences, document.sequences);
    assert_eq!(migrated.project, document.project);
}

#[test]
fn v1_activation_converts_zoom_then_scalar_decisions_in_every_history_snapshot() {
    let original = scalar_legacy();
    let bytes = serde_json::to_value(&original).unwrap();
    let migrated = migration::migrate(original.clone()).unwrap();
    assert_eq!(serde_json::to_value(&original).unwrap(), bytes);
    assert_eq!(migrated.project.assets, original.project.assets);
    assert!(std::sync::Arc::ptr_eq(
        &migrated.project.assets[0].cursor,
        &original.project.assets[0].cursor
    ));
    assert!(std::sync::Arc::ptr_eq(
        &migrated.project.assets[0].zooms,
        &original.project.assets[0].zooms
    ));
    assert_eq!(migrated.revision, original.revision);
    let clip = crate::fixtures::clip(&migrated.project, 0);
    assert_eq!(
        clip.instances
            .iter()
            .map(|instance| instance.definition_id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "beam.color",
            "beam.opacity",
            "beam.framing",
            "beam.gain",
            "beam.opacity",
            "beam.camera.zoom",
        ]
    );
    assert_eq!(
        clip.instances[4],
        crate::fixtures::clip(&original.project, 0).instances[0]
    );
    assert!(!clip.effects.auto_zoom);
    assert_eq!(
        (
            clip.effects.opacity,
            clip.effects.volume,
            clip.effects.scale
        ),
        (1., 1., 1.)
    );
    assert_eq!(
        (
            clip.effects.brightness,
            clip.effects.saturation,
            clip.effects.x,
            clip.effects.y
        ),
        (0., 1., 0.5, 0.5)
    );
    assert_eq!((clip.effects.fade_in_ms, clip.effects.fade_out_ms), (0, 0));
    for (time, opacity, gain) in [(500, 0., 0.), (1500, 0.8, 0.7), (5500, 0., 0.)] {
        assert_eq!(
            clip.instances[1]
                .evaluated(&clip, Time::milliseconds(time))
                .unwrap()["opacity"],
            Value::Number(opacity)
        );
        assert_eq!(
            clip.instances[3]
                .evaluated(&clip, Time::milliseconds(time))
                .unwrap()["volume"],
            Value::Number(gain)
        );
    }
    for state in
        migrated
            .undo
            .iter()
            .chain(&migrated.redo)
            .chain(migrated.sequences.iter().flat_map(|sequence| {
                std::iter::once(&sequence.state)
                    .chain(&sequence.undo)
                    .chain(&sequence.redo)
            }))
    {
        assert_eq!(
            crate::fixtures::decision(&state.clips, 0).instances,
            clip.instances
        );
    }
    let ProjectAction::InsertSequence { sequence, .. } = &migrated.project_undo[0] else {
        panic!("saved deleted sequence")
    };
    for state in std::iter::once(&sequence.state)
        .chain(&sequence.undo)
        .chain(&sequence.redo)
    {
        assert_eq!(
            crate::fixtures::decision(&state.clips, 0).instances,
            clip.instances
        );
    }
    let old_versions: Vec<_> = migrated
        .project
        .definitions
        .iter()
        .filter(|definition| definition.version == 1)
        .cloned()
        .collect();
    assert_eq!(old_versions, original.project.definitions);
    assert_eq!(migration::migrate(migrated.clone()).unwrap(), migrated);
}

#[test]
fn v1_scalar_activation_reopens_without_rewriting_sources_or_regenerating_occurrences() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("media")).unwrap();
    std::fs::write(
        root.path().join("media/source.webm"),
        b"legacy-scalar-source",
    )
    .unwrap();
    let original = scalar_legacy();
    let path = root
        .path()
        .join(beam_editor_domain::project::types::DOCUMENT_FILE);
    let original_bytes = serde_json::to_vec(&original).unwrap();
    std::fs::write(&path, &original_bytes).unwrap();
    let store = beam_editor_domain::project::store::ProjectStore::lock(root.path()).unwrap();
    let (loaded, recovered) = store.read().unwrap();
    assert!(!recovered);
    let ids: Vec<_> = crate::fixtures::clip(&loaded.project, 0)
        .instances
        .iter()
        .map(|instance| instance.id)
        .collect();
    store.write(&loaded).unwrap();
    drop(store);
    let store = beam_editor_domain::project::store::ProjectStore::lock(root.path()).unwrap();
    let reopened = store.read().unwrap().0;
    assert_eq!(reopened, loaded);
    assert_eq!(
        crate::fixtures::clip(&reopened.project, 0)
            .instances
            .iter()
            .map(|instance| instance.id)
            .collect::<Vec<_>>(),
        ids
    );
    assert_eq!(
        std::fs::read(root.path().join("media/source.webm")).unwrap(),
        b"legacy-scalar-source"
    );
    assert_eq!(
        migration::migrate(original).unwrap().project.assets,
        reopened.project.assets
    );
}

#[test]
fn v2_scalar_fields_are_not_retroconverted_and_invalid_v1_metadata_cannot_publish() {
    let mut v2 = scalar_legacy();
    v2.schema_version = DOCUMENT_VERSION;
    assert_eq!(migration::migrate(v2.clone()).unwrap(), v2);
    let original = scalar_legacy();
    for conflict in [false, true] {
        let mut invalid = original.clone();
        if conflict {
            invalid
                .project
                .definitions
                .iter_mut()
                .find(|definition| definition.id == "beam.opacity")
                .unwrap()
                .label = "Conflicting immutable version".into();
        } else {
            crate::fixtures::clip_mut(&mut invalid.project, 0)
                .effects
                .fade_in_ms = 6000;
        }
        let before = serde_json::to_value(&invalid).unwrap();
        assert!(migration::migrate(invalid.clone()).is_err());
        assert_eq!(serde_json::to_value(&invalid).unwrap(), before);
        assert_eq!(invalid.project.assets, original.project.assets);
    }
}
