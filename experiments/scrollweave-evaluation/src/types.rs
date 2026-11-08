use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct Manifest {
    pub cases: Vec<Case>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Case {
    pub name: String,
    pub frames: Vec<String>,
    pub positions: Vec<i32>,
    pub truth: String,
    pub content: [usize; 4],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Measurement {
    pub name: String,
    pub mode: &'static str,
    pub elapsed_ms: u128,
    pub positions: Vec<i32>,
    pub expected_positions: Vec<i32>,
    pub dimensions: [usize; 2],
    pub expected_dimensions: [usize; 2],
    pub mean_absolute_error: Option<f64>,
    pub exact_pixel_ratio: Option<f64>,
    pub warnings: Vec<String>,
    pub passed: bool,
    pub error: Option<String>,
}

#[derive(Clone, Copy)]
pub enum Mode {
    Automatic,
    KnownPositions,
    KnownGeometry,
}
