//! Embeds Beam's existing cursor catalogue and artwork in the native media engine.
use std::{collections::BTreeSet, env, fs, path::PathBuf};

fn main() {
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("../..");
    let catalogue = root.join("src/components/video-editor/properties/cursor");
    let mut packs = vec![];
    let mut paths = BTreeSet::new();
    for name in ["macos-cursor-pack.json", "builtin-cursor-packs.json"] {
        let path = catalogue.join(name);
        println!("cargo:rerun-if-changed={}", path.display());
        let value: serde_json::Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        if let Some(values) = value.as_array() {
            packs.extend(values.iter().cloned());
        } else {
            packs.push(value);
        }
    }
    for pack in &packs {
        for cursor in pack["cursors"].as_array().unwrap() {
            paths.insert(cursor["url"].as_str().unwrap().to_owned());
        }
    }
    let mut source = format!(
        "pub const CATALOG: &str = {:?};\npub fn bundled_bytes(url: &str) -> Option<&'static [u8]> {{ match url {{\n",
        serde_json::to_string(&packs).unwrap()
    );
    for url in paths {
        let path = root.join("public").join(url.trim_start_matches('/'));
        println!("cargo:rerun-if-changed={}", path.display());
        source.push_str(&format!(
            "{url:?} => Some(include_bytes!({:?})),\n",
            path.canonicalize().unwrap()
        ));
    }
    source.push_str("_ => None } }\n");
    fs::write(
        PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("cursors.rs"),
        source,
    )
    .unwrap();
}
