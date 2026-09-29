use beam_editor_domain::effects::{ExtensionPack, PackDraft};

#[test]
fn a_pack_draft_is_sealed_by_the_same_rust_authority_as_registration() {
    let mut definition = beam_editor_domain::effects::catalog::builtins()
        .into_iter()
        .find(|d| d.id == "beam.solid")
        .unwrap();
    definition.id = "demo.artwork".into();
    let draft = PackDraft {
        id: "demo.pack".into(),
        namespace: "demo".into(),
        version: 1,
        definitions: vec![definition],
        presets: vec![],
    };
    let json = serde_json::to_value(&draft).unwrap();
    assert!(json.get("sha256").is_none());
    let sealed = serde_json::from_value::<PackDraft>(json.clone())
        .unwrap()
        .seal()
        .unwrap();
    assert_eq!(sealed.sha256, sealed.canonical_hash().unwrap());
    assert!(serde_json::from_value::<ExtensionPack>(json).is_err());
    let json = serde_json::to_value(&sealed).unwrap();
    assert!(serde_json::from_value::<PackDraft>(json.clone()).is_err());
    assert_eq!(
        serde_json::from_value::<ExtensionPack>(json).unwrap(),
        sealed
    );
}
