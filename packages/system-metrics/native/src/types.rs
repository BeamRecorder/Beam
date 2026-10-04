use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuEngine {
    pub name: String,
    pub busy_percent: f64,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuDevice {
    pub id: String,
    pub name: String,
    pub engines: Vec<GpuEngine>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum GpuSample {
    Sampled {
        version: u8,
        source: &'static str,
        scope: &'static str,
        devices: Vec<GpuDevice>,
    },
    Warming {
        version: u8,
        source: &'static str,
        scope: &'static str,
    },
    Unavailable {
        version: u8,
        code: String,
        reason: String,
    },
}
impl GpuSample {
    pub fn unavailable(code: impl Into<String>, reason: impl Into<String>) -> Self {
        Self::Unavailable {
            version: 1,
            code: code.into(),
            reason: reason.into(),
        }
    }
    pub fn warming(source: &'static str, scope: &'static str) -> Self {
        Self::Warming {
            version: 1,
            source,
            scope,
        }
    }
    pub fn sampled(source: &'static str, scope: &'static str, devices: Vec<GpuDevice>) -> Self {
        Self::Sampled {
            version: 1,
            source,
            scope,
            devices,
        }
    }
}
