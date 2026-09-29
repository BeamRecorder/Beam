#[allow(dead_code)]
#[path = "../../src/beam/files.rs"]
mod files;
#[path = "../../src/runner/paths.rs"]
mod paths;

use std::{fs, path::Path};

#[test]
fn running_binary_uses_the_same_bundle_lookup_as_explicit_paths() {
    assert_eq!(
        paths::running_bundle_path(),
        Some(paths::fallback_bundle_path(
            &std::env::current_exe().unwrap(),
            Path::new(env!("CARGO_MANIFEST_DIR")),
        )),
    );
}

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

#[test]
fn settings_and_editor_resolve_beside_the_launcher() {
    for (settings, editor, name) in [
        (false, false, "app.mjs"),
        (false, true, "editor.mjs"),
        (true, false, "settings.mjs"),
        (true, true, "settings.mjs"),
    ] {
        assert_eq!(
            paths::scene_bundle_path(Some(Path::new("ui/app.mjs").into()), settings, editor),
            Some(Path::new("ui").join(name)),
        );
        assert_eq!(paths::scene_bundle_path(None, settings, editor), None);
    }
}

#[test]
fn asset_lookup_prefers_packaged_files_and_reports_missing_bundle() {
    let root = tempfile::tempdir().unwrap();
    let bundle = root.path().join("native-ui/ui/editor.mjs");
    let packaged = bundle.parent().unwrap().join("assets.json");
    assert_eq!(
        paths::fallback_asset_manifest(Some(&bundle), "assets.json", "assets/manifest.json"),
        Ok(bundle.parent().unwrap().join("../../assets/manifest.json")),
    );
    fs::create_dir_all(packaged.parent().unwrap()).unwrap();
    fs::write(&packaged, "{}").unwrap();
    assert_eq!(
        paths::fallback_asset_manifest(Some(&bundle), "assets.json", "assets/manifest.json"),
        Ok(packaged),
    );
    for missing in [None, Some(Path::new("/"))] {
        assert_eq!(
            paths::fallback_asset_manifest(missing, "assets.json", "assets/manifest.json"),
            Err("bundle path has no directory"),
        );
    }
}

#[test]
fn explicit_assets_do_not_require_a_bundle_path() {
    let explicit = Path::new("/tmp/beam-explicit-assets.json").to_path_buf();
    assert_eq!(
        paths::asset_manifest_path(Some(explicit.clone()), None).unwrap(),
        explicit
    );
}

#[test]
fn packaged_assets_take_precedence_over_development_assets() {
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("native-ui/ui");
    fs::create_dir_all(&directory).unwrap();
    let bundle = directory.join("app.mjs");
    let packaged = directory.join(files::ASSET_MANIFEST);
    fs::write(&packaged, "{}").unwrap();
    assert_eq!(
        paths::asset_manifest_path(None, Some(&bundle)).unwrap(),
        packaged
    );
    fs::remove_file(&packaged).unwrap();
    assert_eq!(
        paths::asset_manifest_path(None, Some(&bundle)).unwrap(),
        directory
            .join("../..")
            .join(files::DEVELOPMENT_ASSET_MANIFEST)
    );
}

#[test]
fn assets_without_explicit_manifest_or_bundle_directory_are_rejected() {
    assert!(paths::asset_manifest_path(None, None).is_err());
    assert!(paths::asset_manifest_path(None, Some(Path::new("/"))).is_err());
}
