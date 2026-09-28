use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RendererProfile {
    pub cpu_ms: f64,
    pub gpu_ms: Option<f64>,
    pub damage_mode: &'static str,
    pub regions: usize,
    pub damaged_pixels: u64,
    pub viewport_pixels: u64,
    pub retained_bytes: u64,
}
