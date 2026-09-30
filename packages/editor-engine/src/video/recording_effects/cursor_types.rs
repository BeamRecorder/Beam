//! Internal catalogue and cached raster ownership; public summaries contain no paths.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::Arc};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pack {
    pub id: String,
    pub name: String,
    pub color_mode: String,
    pub default_cursor_id: String,
    pub cursors: Vec<Artwork>,
    pub automatic_map: BTreeMap<String, String>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artwork {
    pub id: String,
    pub label: String,
    pub url: String,
    pub format: String,
    pub tintable: Option<bool>,
    pub intrinsic_size: Size,
    pub nominal_size: f64,
    pub hotspot: Point,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackSummary {
    pub id: String,
    pub name: String,
    pub cursors: Vec<ArtworkSummary>,
}
#[derive(Clone, Debug, Serialize)]
pub struct ArtworkSummary {
    pub id: String,
    pub label: String,
    pub tintable: bool,
}
pub struct Sprite {
    pub buffer: gst::Buffer,
    pub size: [u32; 2],
    pub hotspot: [f64; 2],
}
pub type RasterCache = std::sync::Mutex<std::collections::VecDeque<(String, Arc<Sprite>)>>;
