use serde::{Deserialize, Serialize};

use crate::model::CaptureRequest;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestEnvelope {
    pub id: String,
    #[serde(flatten)]
    pub command: Command,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "command", rename_all = "kebab-case")]
pub enum Command {
    Discover,
    ResolveDisplay {
        x: i32,
        y: i32,
    },
    Capabilities,
    Permissions,
    InputAccessStatus,
    RequestInputAccess,
    PickScreenColor {
        #[serde(rename = "parentWindowId")]
        parent_window_id: u32,
    },
    Formats {
        source: String,
    },
    SourcePreview {
        source: String,
        #[serde(rename = "maxWidth")]
        max_width: u32,
        #[serde(rename = "maxHeight")]
        max_height: u32,
    },
    WindowSelectionPreview {
        source: String,
        #[serde(default)]
        raise: bool,
    },
    PrepareRegionSelection {
        config: crate::screenshot::ScreenshotRequest,
        #[serde(default)]
        cursor: crate::model::CursorSelection,
    },
    CancelRegionSelection,
    Prepare {
        config: Box<CaptureRequest>,
    },
    Screenshot {
        config: crate::screenshot::ScreenshotRequest,
    },
    Start,
    Pause,
    Resume,
    Cancel,
    Discard,
    Stop,
    Status,
    StartSystemAudioPreview,
    SystemAudioPreviewLevel,
    StopSystemAudioPreview,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn color_selection_preserves_the_owning_window_identifier() {
        let command = serde_json::from_str::<Command>(
            r#"{"command":"pick-screen-color","parentWindowId":42}"#,
        );
        assert!(matches!(
            command,
            Ok(Command::PickScreenColor {
                parent_window_id: 42
            })
        ));
    }

    #[test]
    fn color_selection_serializes_the_unsigned_x11_identifier() {
        let value = serde_json::to_value(Command::PickScreenColor {
            parent_window_id: u32::MAX,
        })
        .unwrap_or_default();
        assert_eq!(value["command"], "pick-screen-color");
        assert_eq!(value["parentWindowId"], u32::MAX);
    }

    #[test]
    fn color_selection_rejects_missing_or_invalid_window_identifiers() {
        for value in [
            r#"{"command":"pick-screen-color"}"#,
            r#"{"command":"pick-screen-color","parentWindowId":-1}"#,
            r#"{"command":"pick-screen-color","parentWindowId":4294967296}"#,
            r#"{"command":"pick-screen-color","parentWindowId":"42"}"#,
        ] {
            assert!(serde_json::from_str::<Command>(value).is_err());
        }
    }

    #[test]
    fn window_selection_inspection_does_not_raise_by_default() {
        let command = serde_json::from_str::<Command>(
            r#"{"command":"window-selection-preview","source":"sck:window:42"}"#,
        );
        assert!(matches!(
            command,
            Ok(Command::WindowSelectionPreview { raise: false, .. })
        ));
    }

    #[test]
    fn window_selection_hover_preserves_the_source_id() {
        let command = Command::WindowSelectionPreview {
            source: "wgc:window:2a".into(),
            raise: true,
        };
        let value = serde_json::to_value(command);
        assert!(value.is_ok());
        let value = value.unwrap_or_default();
        assert_eq!(value["source"], "wgc:window:2a");
        assert_eq!(value["raise"], true);
    }

    #[test]
    fn window_selection_requires_a_source_and_boolean_raise() {
        for value in [
            r#"{"command":"window-selection-preview"}"#,
            r#"{"command":"window-selection-preview","source":42}"#,
            r#"{"command":"window-selection-preview","source":"id","raise":"true"}"#,
        ] {
            assert!(serde_json::from_str::<Command>(value).is_err());
        }
    }
}
