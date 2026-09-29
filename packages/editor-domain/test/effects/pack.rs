use beam_editor_domain::{
    Document, Project,
    animation::{Binding, Value},
    effects::{self, ExtensionPack, pack, preset_types::Preset},
};

fn definition(id: &str) -> effects::Definition {
    let mut result = effects::catalog::builtins()
        .into_iter()
        .find(|d| d.id == "beam.solid")
        .unwrap();
    result.id = id.into();
    result
}
fn preset(id: &str, definition_id: &str) -> Preset {
    let instance = definition(definition_id).instantiate();
    Preset {
        id: id.into(),
        version: 1,
        label: "Animated artwork".into(),
        definition_id: definition_id.into(),
        definition_version: 1,
        parameters: instance.parameters,
    }
}
fn extension() -> ExtensionPack {
    ExtensionPack::new(
        "demo.artwork".into(),
        "demo".into(),
        1,
        vec![definition("demo.red"), definition("demo.blue")],
        vec![
            preset("demo.warm", "demo.red"),
            preset("demo.cool", "demo.blue"),
        ],
    )
    .unwrap()
}

#[test]
fn canonical_hash_is_order_independent_for_catalogues_and_covers_all_payloads() {
    let pack = extension();
    let mut reordered = pack.clone();
    reordered.definitions.reverse();
    reordered.presets.reverse();
    assert_eq!(
        pack.canonical_bytes().unwrap(),
        reordered.canonical_bytes().unwrap()
    );
    reordered.validate().unwrap();
    reordered.definitions[0].label = "Different label".into();
    assert!(reordered.validate().is_err());
    assert_ne!(pack.sha256, reordered.canonical_hash().unwrap());
    let mut changed = pack.clone();
    changed.presets[0].parameters.insert(
        "color".into(),
        Binding::constant(Value::Color([0., 0., 1., 1.])),
    );
    assert_ne!(pack.sha256, changed.canonical_hash().unwrap());
    assert!(changed.validate().is_err());
}

#[test]
fn namespaces_hashes_and_duplicate_versions_are_checked_before_registration() {
    let original = extension();
    for candidate in [
        ExtensionPack {
            namespace: "beam".into(),
            ..original.clone()
        },
        ExtensionPack {
            namespace: "other".into(),
            ..original.clone()
        },
        ExtensionPack {
            sha256: "A".repeat(64),
            ..original.clone()
        },
        ExtensionPack {
            sha256: String::new(),
            ..original.clone()
        },
    ] {
        assert!(candidate.validate().is_err());
    }
    let mut duplicate = original.clone();
    duplicate.definitions.push(duplicate.definitions[0].clone());
    assert!(duplicate.seal().is_err());
    let mut project = Project::new("Packs".into());
    pack::register(&mut project, &original).unwrap();
    let accepted = project.clone();
    assert!(pack::register(&mut project, &original).is_err());
    assert_eq!(project, accepted);
    let renamed = ExtensionPack::new(
        "other.owner".into(),
        "demo".into(),
        2,
        vec![definition("demo.new")],
        vec![],
    )
    .unwrap();
    assert!(pack::register(&mut project, &renamed).is_err());
    assert_eq!(project, accepted);
}

#[test]
fn an_invalid_or_conflicting_preset_cannot_partially_register_its_definitions() {
    let mut project = Project::new("Atomic catalogue".into());
    let accepted = project.clone();
    let missing = ExtensionPack::new(
        "demo.missing".into(),
        "demo".into(),
        1,
        vec![definition("demo.red")],
        vec![preset("demo.unknown", "demo.unregistered")],
    )
    .unwrap();
    assert!(pack::register(&mut project, &missing).is_err());
    assert_eq!(project, accepted);
    let mut invalid = extension();
    invalid.presets[0].parameters.clear();
    let invalid = invalid.seal().unwrap();
    assert!(pack::register(&mut project, &invalid).is_err());
    assert_eq!(project, accepted);
    project.presets.push(preset("demo.warm", "beam.solid"));
    let accepted = project.clone();
    assert!(pack::register(&mut project, &extension()).is_err());
    assert_eq!(project, accepted);
}

#[test]
fn a_preset_only_pack_uses_an_existing_native_definition_and_is_persisted() {
    let mut project = Project::new("Preset package".into());
    let extension = ExtensionPack::new(
        "demo.presets".into(),
        "demo".into(),
        1,
        vec![],
        vec![preset("demo.warm", "beam.solid")],
    )
    .unwrap();
    pack::register(&mut project, &extension).unwrap();
    pack::validate_provenance(&project).unwrap();
    let root = tempfile::tempdir().unwrap();
    let document = Document::new(project);
    let index = beam_editor_domain::project::blocks::index(root.path(), &document).unwrap();
    let loaded = beam_editor_domain::project::blocks::load(root.path(), index).unwrap();
    assert_eq!(
        loaded.project.extension_packs,
        document.project.extension_packs
    );
    assert_eq!(loaded.project.presets, document.project.presets);
    pack::validate_provenance(&loaded.project).unwrap();
}

#[test]
fn provenance_detects_modified_missing_and_multiply_claimed_catalogue_contents() {
    let mut original = Project::new("Integrity".into());
    pack::register(&mut original, &extension()).unwrap();
    for change in 0..4 {
        let mut project = original.clone();
        match change {
            0 => {
                project
                    .definitions
                    .iter_mut()
                    .find(|d| d.id == "demo.red")
                    .unwrap()
                    .label = "Modified".into()
            }
            1 => project.definitions.retain(|d| d.id != "demo.red"),
            2 => project
                .extension_packs
                .push(project.extension_packs[0].clone()),
            _ => project.presets.retain(|p| p.id != "demo.warm"),
        }
        assert!(pack::validate_provenance(&project).is_err());
        assert!(beam_editor_domain::project::validation::project(&project).is_err());
    }
}
