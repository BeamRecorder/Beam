//! Application-owned asset imports for the native QuickJS runner.

use argui_paint::{ImageId, VectorId};
use argui_runtime::NativeHostAssets;
use serde_json::Value;
use std::{
    fs,
    path::{Component, Path},
};

/// Decoder selected by the source asset's file format.
#[derive(Clone, Copy)]
pub enum AssetKind {
    /// Encoded PNG, JPEG, or WebP raster.
    Image,
    /// Encoded SVG vector.
    Svg,
}

/// Encoded image or SVG to register with the native renderer.
pub struct AssetInput<'a> {
    /// Logical file name included in decode errors.
    pub key: &'a str,
    /// Decoder for the source bytes.
    pub kind: AssetKind,
    /// Stable ID shared with the JavaScript asset reference.
    pub id: u64,
    /// Encoded source bytes.
    pub bytes: &'a [u8],
}

/// Decodes the app's selected SVG and raster files from `ARGUI_APP_ASSETS`.
///
/// # Errors
/// Returns an error if the manifest or a source file is missing, invalid, or escapes its app root.
pub fn load() -> Result<NativeHostAssets, String> {
    let Some(path) = std::env::var_os("ARGUI_APP_ASSETS") else {
        return Ok(NativeHostAssets::default());
    };
    load_manifest(Path::new(&path))
}

/// Decodes the app-local asset manifest and the source files it names.
///
/// `manifest` is the generated JSON file next to the application's `assets/`
/// directory. Returns native assets with the stable IDs in that file.
///
/// # Errors
/// Returns an error for malformed fields, unsafe paths, missing files, or invalid images/SVGs.
pub fn load_manifest(manifest: &Path) -> Result<NativeHostAssets, String> {
    let document: Value = serde_json::from_slice(
        &fs::read(manifest).map_err(|error| format!("{}: {error}", manifest.display()))?,
    )
    .map_err(|error| format!("{}: {error}", manifest.display()))?;
    let sources = document
        .get("assets")
        .and_then(Value::as_array)
        .ok_or("asset manifest must contain an assets array")?;
    let root = manifest.parent().ok_or("asset manifest has no parent")?;
    let root = fs::canonicalize(root.join("assets")).map_err(|error| error.to_string())?;
    let mut assets = NativeHostAssets::default();
    for source in sources {
        let key = source
            .get("key")
            .and_then(Value::as_str)
            .ok_or("asset key is missing")?;
        let path = source
            .get("path")
            .and_then(Value::as_str)
            .ok_or("asset path is missing")?;
        let id = source
            .get("id")
            .and_then(Value::as_u64)
            .filter(|id| *id > 0 && *id < (1_u64 << 53))
            .ok_or("asset ID must be a positive JavaScript-safe integer")?;
        let kind = match source.get("kind").and_then(Value::as_str) {
            Some("svg") => AssetKind::Svg,
            Some("image") => AssetKind::Image,
            _ => return Err(format!("{key}: unsupported asset kind")),
        };
        let relative = Path::new(path);
        if !relative
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
        {
            return Err(format!("{key}: unsafe asset path {path}"));
        }
        let file =
            fs::canonicalize(root.join(relative)).map_err(|error| format!("{key}: {error}"))?;
        if !file.starts_with(&root) {
            return Err(format!("{key}: asset path escapes app root"));
        }
        let bytes = fs::read(&file).map_err(|error| format!("{key}: {error}"))?;
        let decoded = decode_assets(&[AssetInput {
            key,
            kind,
            id,
            bytes: &bytes,
        }])?;
        assets.images.extend(decoded.images);
        assets.vectors.extend(decoded.vectors);
    }
    Ok(assets)
}

/// Decodes a manifest of raster images and SVGs into native render assets.
///
/// The `sources` entries provide stable IDs and encoded bytes. Returns the
/// decoded assets in their input order, split by raster and vector format.
///
/// # Errors
/// Returns an error naming the first source whose bytes cannot be decoded.
pub fn decode_assets(sources: &[AssetInput<'_>]) -> Result<NativeHostAssets, String> {
    let mut assets = NativeHostAssets::default();
    for asset in sources {
        match asset.kind {
            AssetKind::Image => assets.images.push(
                argui_media::image::decode(ImageId(asset.id), asset.bytes)
                    .map_err(|error| format!("{}: {error}", asset.key))?,
            ),
            AssetKind::Svg => assets.vectors.push(
                argui_media::svg::parse_svg(VectorId(asset.id), asset.bytes)
                    .map_err(|error| format!("{}: {error}", asset.key))?,
            ),
        }
    }
    Ok(assets)
}
