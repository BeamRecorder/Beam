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
