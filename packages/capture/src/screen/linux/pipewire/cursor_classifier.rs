use std::{
    collections::{HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, OnceLock},
};

use pipewire::spa::param::video::VideoFormat;
use xcursor::{CursorTheme, parser::parse_xcursor};

use crate::cursor::{CursorKind, Hotspot};

const SIGNATURE_SIDE: usize = 24;
const MATCH_THRESHOLD: f64 = 0.18;
const MATCH_MARGIN: f64 = 0.02;

#[derive(Debug, Clone)]
struct ThemeCursor {
    kind: CursorKind,
    width: u32,
    height: u32,
    hotspot: Hotspot,
    signature: Box<[u8]>,
}

#[derive(Debug)]
pub(super) struct CursorClassifier {
    candidates: Arc<[ThemeCursor]>,
    cache: HashMap<u64, CursorKind>,
}

impl CursorClassifier {
    pub(super) fn system() -> Self {
        static CANDIDATES: OnceLock<Arc<[ThemeCursor]>> = OnceLock::new();
        Self {
            candidates: CANDIDATES
                .get_or_init(|| load_system_candidates().into())
                .clone(),
            cache: HashMap::new(),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) fn classify(
        &mut self,
        shape_id: u64,
        format: VideoFormat,
        width: u32,
        height: u32,
        stride: i32,
        pixels: &[u8],
        hotspot: Hotspot,
    ) -> CursorKind {
        if let Some(kind) = self.cache.get(&shape_id) {
            return *kind;
        }
        let kind = canonical_bitmap(format, width, height, stride, pixels)
            .and_then(|pixels| self.match_pixels(width, height, hotspot, &pixels))
            .unwrap_or(CursorKind::Custom);
        self.cache.insert(shape_id, kind);
        kind
    }

    fn match_pixels(
        &self,
        width: u32,
        height: u32,
        hotspot: Hotspot,
        pixels: &[u8],
    ) -> Option<CursorKind> {
        if self.candidates.is_empty() {
            return None;
        }
        let signature = image_signature(pixels, width, height)?;
        let mut best_by_kind: Vec<(CursorKind, f64)> = Vec::new();
        for candidate in self.candidates.iter() {
            let image_distance = signature_distance(&signature, &candidate.signature);
            let hotspot_distance = normalized_hotspot_distance(
                hotspot,
                width,
                height,
                candidate.hotspot,
                candidate.width,
                candidate.height,
            );
            let score = image_distance + hotspot_distance * 0.2;
            if let Some((_, best)) = best_by_kind
                .iter_mut()
                .find(|(kind, _)| *kind == candidate.kind)
            {
                *best = best.min(score);
            } else {
                best_by_kind.push((candidate.kind, score));
            }
        }
        best_by_kind.sort_by(|left, right| left.1.total_cmp(&right.1));
        let (kind, best) = *best_by_kind.first()?;
        let second = best_by_kind.get(1).map_or(f64::INFINITY, |entry| entry.1);
        (best <= MATCH_THRESHOLD && second - best >= MATCH_MARGIN).then_some(kind)
    }
}

fn load_system_candidates() -> Vec<ThemeCursor> {
    let mut candidates = Vec::new();
    for theme_name in system_theme_names() {
        load_theme_candidates(&CursorTheme::load(&theme_name), &mut candidates);
    }
    candidates
}

fn load_theme_candidates(theme: &CursorTheme, candidates: &mut Vec<ThemeCursor>) {
    load_kind(
        theme,
        candidates,
        CursorKind::Default,
        &["default", "left_ptr", "arrow"],
        &[],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Textcursor,
        &["text", "xterm", "vertical-text"],
        &["ibeam"],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Handpointing,
        &[
            "pointer",
            "pointing_hand",
            "hand",
            "openhand",
            "closedhand",
            "grab",
            "grabbing",
            "copy",
            "alias",
        ],
        &["hand1", "hand2", "link"],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Busy,
        &["wait", "progress"],
        &["watch", "half-busy", "left_ptr_watch"],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Help,
        &["help"],
        &["whats_this", "question_arrow", "left_ptr_help"],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Cross,
        &["crosshair", "cross", "cell"],
        &["tcross", "diamond_cross"],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Move,
        &["move", "all-scroll"],
        &["fleur", "size_all", "dnd-move"],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Notallowed,
        &["not-allowed", "no-drop"],
        &["forbidden", "crossed_circle", "dnd-no-drop"],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Resizewesteast,
        &["ew-resize", "e-resize", "w-resize", "col-resize"],
        &["size-hor", "size_hor", "sb_h_double_arrow"],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Resizenorthsouth,
        &["ns-resize", "n-resize", "s-resize", "row-resize"],
        &["size-ver", "size_ver", "sb_v_double_arrow"],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Resizenortheastsouthwest,
        &["nesw-resize", "ne-resize", "sw-resize"],
        &["size-bdiag", "size_bdiag"],
    );
    load_kind(
        theme,
        candidates,
        CursorKind::Resizenorthwestsoutheast,
        &["nwse-resize", "nw-resize", "se-resize"],
        &["size-fdiag", "size_fdiag"],
    );
}

fn load_kind(
    theme: &CursorTheme,
    candidates: &mut Vec<ThemeCursor>,
    kind: CursorKind,
    preferred_names: &[&str],
    legacy_names: &[&str],
) {
    let mut paths = icon_paths(theme, preferred_names);
    if paths.is_empty() {
        paths = icon_paths(theme, legacy_names);
    }
    for path in paths {
        let Ok(contents) = fs::read(path) else {
            continue;
        };
        let Some(images) = parse_xcursor(&contents) else {
            continue;
        };
        for image in images {
            let pixels = xcursor_pixels_to_rgba(&image.pixels_rgba);
            let Some(signature) = image_signature(&pixels, image.width, image.height) else {
                continue;
            };
            let candidate = ThemeCursor {
                kind,
                width: image.width,
                height: image.height,
                hotspot: Hotspot {
                    x: image.xhot,
                    y: image.yhot,
                },
                signature,
            };
            if !candidates.iter().any(|existing| {
                existing.kind == candidate.kind
                    && existing.width == candidate.width
                    && existing.height == candidate.height
                    && existing.hotspot == candidate.hotspot
                    && existing.signature == candidate.signature
            }) {
                candidates.push(candidate);
            }
        }
    }
}

fn icon_paths(theme: &CursorTheme, names: &[&str]) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    names
        .iter()
        .filter_map(|name| theme.load_icon(name))
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

fn system_theme_names() -> Vec<String> {
    let mut names = Vec::new();
    push_theme(&mut names, env::var("XCURSOR_THEME").ok());
    push_theme(&mut names, gsettings_theme());
    for path in settings_paths() {
        push_theme(
            &mut names,
            setting_value(&path, "gtk-cursor-theme-name")
                .or_else(|| setting_value(&path, "cursorTheme")),
        );
    }
    push_theme(&mut names, Some("default".into()));
    names
}

fn gsettings_theme() -> Option<String> {
    let output = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "cursor-theme"])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| clean_setting(String::from_utf8_lossy(&output.stdout).as_ref()))
        .flatten()
}

fn settings_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(config) = env::var_os("XDG_CONFIG_HOME") {
        let config = PathBuf::from(config);
        paths.extend([
            config.join("gtk-4.0/settings.ini"),
            config.join("gtk-3.0/settings.ini"),
            config.join("kcminputrc"),
        ]);
    } else if let Some(home) = env::var_os("HOME") {
        let config = PathBuf::from(home).join(".config");
        paths.extend([
            config.join("gtk-4.0/settings.ini"),
            config.join("gtk-3.0/settings.ini"),
            config.join("kcminputrc"),
        ]);
    }
    paths
}

fn setting_value(path: &Path, key: &str) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    contents.lines().find_map(|line| {
        let (candidate, value) = line.split_once('=')?;
        (candidate.trim() == key)
            .then(|| clean_setting(value))
            .flatten()
    })
}

fn clean_setting(value: &str) -> Option<String> {
    let value = value.trim().trim_matches(['\'', '"']).trim();
    (!value.is_empty()).then(|| value.to_owned())
}

fn push_theme(names: &mut Vec<String>, candidate: Option<String>) {
    if let Some(candidate) = candidate.filter(|name| !name.is_empty())
        && !names.iter().any(|name| name == &candidate)
    {
        names.push(candidate);
    }
}

fn canonical_bitmap(
    format: VideoFormat,
    width: u32,
    height: u32,
    stride: i32,
    pixels: &[u8],
) -> Option<Vec<u8>> {
    let width = usize::try_from(width).ok()?;
    let height = usize::try_from(height).ok()?;
    let row_bytes = width.checked_mul(4)?;
    let stride_bytes = usize::try_from(stride.unsigned_abs()).ok()?;
    if width == 0 || height == 0 || stride_bytes < row_bytes {
        return None;
    }
    let required = height.checked_mul(stride_bytes)?;
    if pixels.len() < required {
        return None;
    }
    let mut rgba = Vec::with_capacity(height.checked_mul(row_bytes)?);
    for output_y in 0..height {
        let source_y = if stride < 0 {
            height - 1 - output_y
        } else {
            output_y
        };
        let row = pixels.get(source_y * stride_bytes..source_y * stride_bytes + row_bytes)?;
        for pixel in row.chunks_exact(4) {
            let channels = match format {
                VideoFormat::RGBA => [pixel[0], pixel[1], pixel[2], pixel[3]],
                VideoFormat::BGRA => [pixel[2], pixel[1], pixel[0], pixel[3]],
                VideoFormat::ARGB => [pixel[1], pixel[2], pixel[3], pixel[0]],
                VideoFormat::ABGR => [pixel[3], pixel[2], pixel[1], pixel[0]],
                _ => return None,
            };
            push_normalized_pixel(&mut rgba, channels);
        }
    }
    Some(rgba)
}

fn xcursor_pixels_to_rgba(pixels: &[u8]) -> Vec<u8> {
    let mut rgba = Vec::with_capacity(pixels.len());
    for pixel in pixels.chunks_exact(4) {
        push_normalized_pixel(&mut rgba, [pixel[2], pixel[1], pixel[0], pixel[3]]);
    }
    rgba
}

fn push_normalized_pixel(output: &mut Vec<u8>, mut pixel: [u8; 4]) {
    if pixel[3] == 0 {
        pixel[..3].fill(0);
    }
    output.extend_from_slice(&pixel);
}

fn image_signature(pixels: &[u8], width: u32, height: u32) -> Option<Box<[u8]>> {
    let width = usize::try_from(width).ok()?;
    let height = usize::try_from(height).ok()?;
    if width == 0 || height == 0 || pixels.len() != width.checked_mul(height)?.checked_mul(4)? {
        return None;
    }
    let mut signature = Vec::with_capacity(SIGNATURE_SIDE * SIGNATURE_SIDE * 4);
    for y in 0..SIGNATURE_SIDE {
        for x in 0..SIGNATURE_SIDE {
            let source_x = ((x * width) + width / 2) / SIGNATURE_SIDE;
            let source_y = ((y * height) + height / 2) / SIGNATURE_SIDE;
            let source_x = source_x.min(width - 1);
            let source_y = source_y.min(height - 1);
            let offset = (source_y * width + source_x) * 4;
            signature.extend_from_slice(pixels.get(offset..offset + 4)?);
        }
    }
    Some(signature.into_boxed_slice())
}

fn signature_distance(left: &[u8], right: &[u8]) -> f64 {
    if left.len() != right.len() || left.is_empty() {
        return f64::INFINITY;
    }
    let difference: u64 = left
        .iter()
        .zip(right)
        .map(|(left, right)| u64::from(left.abs_diff(*right)))
        .sum();
    difference as f64 / (left.len() as f64 * 255.0)
}

fn normalized_hotspot_distance(
    left: Hotspot,
    left_width: u32,
    left_height: u32,
    right: Hotspot,
    right_width: u32,
    right_height: u32,
) -> f64 {
    let left_x = f64::from(left.x) / f64::from(left_width.max(1));
    let left_y = f64::from(left.y) / f64::from(left_height.max(1));
    let right_x = f64::from(right.x) / f64::from(right_width.max(1));
    let right_y = f64::from(right.y) / f64::from(right_height.max(1));
    (left_x - right_x).abs() + (left_y - right_y).abs()
}

#[cfg(test)]
#[path = "cursor_classifier_tests.rs"]
mod tests;
