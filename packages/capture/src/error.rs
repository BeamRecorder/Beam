use std::io;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NativeCaptureErrorCode {
    PortalUnavailable,
    PortalVersionUnsupported,
    PortalCursorMetadataUnavailable,
    PortalCancelled,
    PortalDenied,
    PortalSessionClosed,
    PortalInvalidStreamResponse,
    PipewireConnectFailed,
    PipewireStreamDisconnected,
    PipewireFormatUnsupported,
    PipewireMemoryUnsupported,
    PipewireBufferInvalid,
    PipewireTimestampDiscontinuity,
    ScreenSinkBackpressure,
    ScreenSinkFailed,
    FfmpegUnavailable,
    FfmpegEncoderUnavailable,
    FfmpegFailed,
    FfmpegOutputInvalid,
}

impl NativeCaptureErrorCode {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PortalUnavailable => "portal-unavailable",
            Self::PortalVersionUnsupported => "portal-version-unsupported",
            Self::PortalCursorMetadataUnavailable => "portal-cursor-metadata-unavailable",
            Self::PortalCancelled => "portal-cancelled",
            Self::PortalDenied => "portal-denied",
            Self::PortalSessionClosed => "portal-session-closed",
            Self::PortalInvalidStreamResponse => "portal-invalid-stream-response",
            Self::PipewireConnectFailed => "pipewire-connect-failed",
            Self::PipewireStreamDisconnected => "pipewire-stream-disconnected",
            Self::PipewireFormatUnsupported => "pipewire-format-unsupported",
            Self::PipewireMemoryUnsupported => "pipewire-memory-unsupported",
            Self::PipewireBufferInvalid => "pipewire-buffer-invalid",
            Self::PipewireTimestampDiscontinuity => "pipewire-timestamp-discontinuity",
            Self::ScreenSinkBackpressure => "screen-sink-backpressure",
            Self::ScreenSinkFailed => "screen-sink-failed",
            Self::FfmpegUnavailable => "ffmpeg-unavailable",
            Self::FfmpegEncoderUnavailable => "ffmpeg-encoder-unavailable",
            Self::FfmpegFailed => "ffmpeg-failed",
            Self::FfmpegOutputInvalid => "ffmpeg-output-invalid",
        }
    }
}

/// Errors produced by capture discovery, validation and recording.
#[derive(Debug, Error)]
pub enum CaptureError {
    #[error("invalid configuration: {0}")]
    InvalidConfiguration(String),
    #[error("source not found: {0}")]
    SourceNotFound(String),
    #[error("unsupported operation: {0}")]
    Unsupported(String),
    #[error("permission denied: {0}")]
    PermissionDenied(String),
    #[error("invalid state transition: {from} -> {to}")]
    InvalidTransition { from: String, to: String },
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error("storage error at {path}: {source}")]
    Storage {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("backend error: {0}")]
    Backend(String),
    #[error("operation cancelled")]
    Cancelled,
    #[error("{code}: {message}", code = code.as_str())]
    Native {
        code: NativeCaptureErrorCode,
        message: String,
    },
}

impl CaptureError {
    pub(crate) fn storage(path: &std::path::Path, source: io::Error) -> Self {
        Self::Storage {
            path: path.display().to_string(),
            source,
        }
    }

    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::Native { code, .. } => code.as_str(),
            Self::InvalidConfiguration(_) => "invalid-configuration",
            Self::SourceNotFound(_) => "source-not-found",
            Self::Unsupported(_) => "unsupported-operation",
            Self::PermissionDenied(_) => "permission-denied",
            Self::InvalidTransition { .. } => "invalid-transition",
            Self::Protocol(_) => "protocol-error",
            Self::Storage { .. } => "storage-error",
            Self::Serialization(_) => "serialization-error",
            Self::Backend(_) => "capture-error",
            Self::Cancelled => "cancelled",
        }
    }

    pub(crate) fn native(code: NativeCaptureErrorCode, message: impl Into<String>) -> Self {
        Self::Native {
            code,
            message: message.into(),
        }
    }
}
