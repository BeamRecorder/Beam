use beam_editor_domain::effects::{self, ExtensionPack, ScopeTarget};
use sha2::{Digest, Sha256};

#[test]
fn a_legacy_sealed_pack_roundtrip_keeps_missing_targets_and_its_exact_digest() {
    let mut definition = effects::definition(&effects::catalog::builtins(), "beam.color", 1)
        .unwrap()
        .clone();
    definition.id = "demo.color".into();
    let mut legacy = serde_json::json!({
        "id":"demo.legacy", "namespace":"demo", "version":1,
        "definitions":[definition], "presets":[]
    });
    assert!(legacy["definitions"][0].get("targets").is_none());
    let canonical = serde_json::to_vec(&legacy).unwrap();
    let expected = format!("{:x}", Sha256::digest(&canonical));
    legacy["sha256"] = expected.clone().into();
    let pack: ExtensionPack = serde_json::from_value(legacy.clone()).unwrap();
    pack.validate().unwrap();
    assert_eq!(pack.definitions[0].targets, vec![ScopeTarget::Clip]);
    assert_eq!(pack.canonical_bytes().unwrap(), canonical);
    assert_eq!(pack.canonical_hash().unwrap(), expected);
    let roundtrip = serde_json::to_value(pack).unwrap();
    assert_eq!(roundtrip, legacy);
    assert!(serde_json::from_value::<ScopeTarget>(serde_json::json!("source")).is_err());
}
