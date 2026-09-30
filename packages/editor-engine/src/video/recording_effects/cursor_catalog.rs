//! Uses the same bundled cursor assets and imported library as Beam's original editor.
use super::cursor_types::{Artwork, ArtworkSummary, Pack, PackSummary};
use crate::{Result, video::pipeline::media};
use beam_editor_domain::recording::cursor_style_types::{CursorSelection, SelectionMode};
use std::{
    path::{Path, PathBuf},
    sync::OnceLock,
};
mod bundled {
    include!(concat!(env!("OUT_DIR"), "/cursors.rs"));
}
static LIBRARY: OnceLock<PathBuf> = OnceLock::new();

/// Configures the host-owned existing cursor library before opening any project.
pub fn configure_library(path: PathBuf) -> Result<()> {
    if LIBRARY.get().is_some_and(|current| *current != path) {
        return Err(media("cursor library already configured"));
    }
    let _ = LIBRARY.set(path);
    Ok(())
}
pub fn packs() -> Result<Vec<Pack>> {
    let mut values: Vec<Pack> = serde_json::from_str(bundled::CATALOG)?;
    if let Some(root) = LIBRARY.get().filter(|root| root.exists()) {
        for entry in std::fs::read_dir(root).map_err(media)? {
            let entry = entry.map_err(media)?;
            let id = entry.file_name().to_string_lossy().into_owned();
            if id.len() != 64
                || !id.bytes().all(|b| b.is_ascii_hexdigit())
                || !entry.file_type().map_err(media)?.is_dir()
            {
                continue;
            }
            let path = safe_file(root, &format!("{id}/pack.json"))?;
            let pack: Pack = serde_json::from_slice(&read(&path)?)?;
            if pack.id != id {
                return Err(media("imported cursor pack identity mismatch"));
            }
            validate(&pack)?;
            values.push(pack);
        }
    }
    Ok(values)
}
pub fn summaries() -> Result<Vec<PackSummary>> {
    Ok(packs()?
        .into_iter()
        .map(|pack| PackSummary {
            id: pack.id,
            name: pack.name,
            cursors: pack
                .cursors
                .into_iter()
                .map(|art| ArtworkSummary {
                    id: art.id,
                    label: art.label,
                    tintable: art.format == "svg"
                        && art.tintable.unwrap_or(pack.color_mode == "tintable"),
                })
                .collect(),
        })
        .collect())
}
pub fn resolve<'a>(
    pack: &'a Pack,
    selection: &CursorSelection,
    role: Option<&str>,
) -> Result<&'a Artwork> {
    if selection.mode == SelectionMode::Fixed {
        return pack
            .cursors
            .iter()
            .find(|a| Some(&a.id) == selection.cursor_id.as_ref())
            .ok_or_else(|| media("selected cursor artwork is unavailable"));
    }
    let role = role.unwrap_or("default");
    if let Some(mapped) = pack.automatic_map.get(role)
        && let Some(art) = pack.cursors.iter().find(|a| a.id == *mapped)
    {
        return Ok(art);
    }
    let candidates: &[&str] = match role {
        "default" | "custom" => &["default", "left_ptr", "arrow"],
        "handpointing" => &["handpointing", "pointer", "hand2"],
        "textcursor" => &["textcursor", "text", "xterm"],
        "textcursorvertical" => &["textcursorvertical", "vertical-text"],
        "handopen" => &["handopen", "grab", "openhand"],
        "handgrabbing" => &["handgrabbing", "grabbing", "closedhand"],
        "cross" => &["cross", "crosshair"],
        "notallowed" => &["notallowed", "not-allowed", "forbidden"],
        "move" => &["move", "all-scroll"],
        "busy" => &["busy", "progress"],
        "beachball" => &["beachball", "wait"],
        "resizenorthsouth" => &["resizenorthsouth", "ns-resize", "row-resize"],
        "resizewesteast" => &["resizewesteast", "ew-resize", "col-resize"],
        "resizenorthwestsoutheast" => &["resizenorthwestsoutheast", "nwse-resize"],
        "resizenortheastsouthwest" => &["resizenortheastsouthwest", "nesw-resize"],
        _ => &[role],
    };
    for id in candidates {
        if let Some(art) = pack.cursors.iter().find(|a| a.id == *id) {
            return Ok(art);
        }
    }
    pack.cursors
        .iter()
        .find(|a| a.id == pack.default_cursor_id)
        .ok_or_else(|| media("cursor pack has no default artwork"))
}
pub fn bytes(pack: &Pack, art: &Artwork) -> Result<Vec<u8>> {
    if let Some(bytes) = bundled::bundled_bytes(&art.url) {
        return Ok(bytes.to_vec());
    }
    let prefix = format!("project-media://cursor/{}/", pack.id);
    let name = art
        .url
        .strip_prefix(&prefix)
        .ok_or_else(|| media("invalid imported cursor asset identity"))?;
    if name.is_empty()
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        || !["png", "svg"].contains(&art.format.as_str())
    {
        return Err(media("invalid imported cursor asset"));
    }
    let root = LIBRARY
        .get()
        .ok_or_else(|| media("imported cursor library is unavailable"))?;
    read(&safe_file(
        root,
        &format!("{}/{name}.{}", pack.id, art.format),
    )?)
}
fn safe_file(root: &Path, relative: &str) -> Result<PathBuf> {
    let base = root.canonicalize().map_err(media)?;
    let path = root.join(relative).canonicalize().map_err(media)?;
    if !path.starts_with(base) || !path.is_file() {
        return Err(media("cursor asset escapes its library"));
    }
    Ok(path)
}
fn read(path: &Path) -> Result<Vec<u8>> {
    use std::io::Read;
    let mut data = vec![];
    std::fs::File::open(path)
        .map_err(media)?
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut data)
        .map_err(media)?;
    if data.len() > 2 * 1024 * 1024 {
        return Err(media("cursor asset exceeds 2 MiB"));
    }
    Ok(data)
}
fn validate(pack: &Pack) -> Result<()> {
    if pack.cursors.is_empty() || pack.cursors.len() > 256 || pack.name.len() > 256 {
        return Err(media("invalid cursor pack"));
    }
    for art in &pack.cursors {
        if art.intrinsic_size.width == 0
            || art.intrinsic_size.height == 0
            || art.intrinsic_size.width > 512
            || art.intrinsic_size.height > 512
            || !art.nominal_size.is_finite()
            || art.nominal_size <= 0.
            || !art.hotspot.x.is_finite()
            || !art.hotspot.y.is_finite()
            || art.hotspot.x < 0.
            || art.hotspot.y < 0.
            || art.hotspot.x > f64::from(art.intrinsic_size.width)
            || art.hotspot.y > f64::from(art.intrinsic_size.height)
        {
            return Err(media("invalid cursor artwork geometry"));
        }
    }
    Ok(())
}
