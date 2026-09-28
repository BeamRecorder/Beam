#[path = "../../src/runner/paths.rs"]
mod paths;

use std::{fs, path::Path};

#[test]
fn cargo_binary_uses_the_beam_ui_bundle() {
    let root = std::env::temp_dir().join(format!("beam-native-paths-{}", std::process::id()));
    let cargo = root.join("target/debug/beam-native");
    let manifest = root.join("apps/beam-native");
    fs::create_dir_all(cargo.parent().unwrap()).unwrap();
    assert_eq!(
        paths::fallback_bundle_path(&cargo, &manifest),
        manifest.join("../../packages/beam-ui/dist/native/app.mjs")
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn staged_binary_uses_its_adjacent_ui_bundle() {
    let root = std::env::temp_dir().join(format!("beam-native-stage-{}", std::process::id()));
    let executable = root.join("native-ui/beam-native");
    let bundle = root.join("native-ui/ui/app.mjs");
    fs::create_dir_all(bundle.parent().unwrap()).unwrap();
    fs::write(&bundle, "bundle").unwrap();
    assert_eq!(
        paths::fallback_bundle_path(&executable, Path::new("/unused")),
        bundle
    );
    fs::remove_dir_all(root).unwrap();
}
