use serde::Serialize;

use crate::{CaptureError, model::SourceId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl SelectionBounds {
    pub fn from_rect(x: f64, y: f64, width: f64, height: f64) -> Result<Self, CaptureError> {
        if ![x, y, width, height].iter().all(|value| value.is_finite())
            || x < f64::from(i32::MIN)
            || x > f64::from(i32::MAX)
            || y < f64::from(i32::MIN)
            || y > f64::from(i32::MAX)
            || width < 1.0
            || width > f64::from(u32::MAX)
            || height < 1.0
            || height > f64::from(u32::MAX)
        {
            return Err(CaptureError::Backend(
                "The selected window has invalid bounds".into(),
            ));
        }
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        Ok(Self {
            x: x.round() as i32,
            y: y.round() as i32,
            width: width.round() as u32,
            height: height.round() as u32,
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSelectionPreview {
    pub bounds: SelectionBounds,
    pub raise_error: Option<String>,
}

#[cfg(any(test, windows, target_os = "macos"))]
pub(crate) fn parse_window_id(
    source: &SourceId,
    prefix: &str,
    radix: u32,
) -> Result<u64, CaptureError> {
    let value = source.as_str().strip_prefix(prefix).filter(|value| {
        !value.is_empty() && value.chars().all(|character| character.is_ascii_hexdigit())
    });
    value
        .and_then(|value| u64::from_str_radix(value, radix).ok())
        .filter(|id| *id > 0)
        .ok_or_else(|| CaptureError::SourceNotFound(source.to_string()))
}

pub fn preview_window_selection(
    source: &SourceId,
    raise: bool,
) -> Result<WindowSelectionPreview, CaptureError> {
    #[cfg(windows)]
    {
        super::win::preview_window_selection(source, raise)
    }
    #[cfg(target_os = "macos")]
    {
        super::mac::preview_window_selection(source, raise)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (source, raise);
        Err(CaptureError::Unsupported(
            "Linux source selection belongs to the Portal".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_and_rounds_negative_and_fractional_bounds() {
        let bounds = SelectionBounds::from_rect(-1920.2, -20.7, 1280.1, 720.4);
        assert_eq!(
            bounds.ok(),
            Some(SelectionBounds {
                x: -1920,
                y: -21,
                width: 1280,
                height: 720
            })
        );
        assert!(SelectionBounds::from_rect(0.0, 0.0, 1.0, 1.0).is_ok());
        assert!(
            SelectionBounds::from_rect(f64::from(i32::MIN), f64::from(i32::MAX), 1.0, 1.0).is_ok()
        );
    }

    #[test]
    fn rejects_non_finite_zero_and_overflowing_geometry() {
        for values in [
            [f64::NAN, 0.0, 1.0, 1.0],
            [0.0, f64::INFINITY, 1.0, 1.0],
            [0.0, 0.0, 0.0, 1.0],
            [0.0, 0.0, 1.0, -1.0],
            [f64::from(i32::MAX) + 1.0, 0.0, 1.0, 1.0],
            [0.0, 0.0, f64::from(u32::MAX) + 1.0, 1.0],
        ] {
            assert!(
                SelectionBounds::from_rect(values[0], values[1], values[2], values[3]).is_err()
            );
        }
    }

    #[test]
    fn parses_native_handles_without_accepting_other_sources_or_overflow() {
        let parse = |text| {
            SourceId::new(text).and_then(|source| parse_window_id(&source, "wgc:window:", 16))
        };
        assert_eq!(parse("wgc:window:2a").ok(), Some(42));
        assert_eq!(parse("wgc:window:1000").ok(), Some(4096));
        for value in [
            "window:42:0",
            "wgc:monitor:2a",
            "wgc:window:0",
            "wgc:window:-1",
            "wgc:window:xyz",
            "wgc:window:fffffffffffffffff",
        ] {
            assert!(parse(value).is_err());
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_window_selection_is_explicitly_unsupported() {
        let result = SourceId::new("portal:window")
            .and_then(|source| preview_window_selection(&source, true));
        assert!(matches!(result, Err(CaptureError::Unsupported(_))));
    }
}
