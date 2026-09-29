//! Editable generated title data; no media file is fabricated for a title.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Title {
    pub text: String,
    pub font: String,
    pub bold: bool,
    pub italic: bool,
    pub size: f64,
    pub color: u32,
    pub shadow: bool,
    pub background: bool,
}
impl Default for Title {
    fn default() -> Self {
        Self {
            text: "Title".into(),
            font: "Sans".into(),
            bold: false,
            italic: false,
            size: 6.6,
            color: 0xffffffff,
            shadow: true,
            background: false,
        }
    }
}
