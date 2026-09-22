#![cfg(test)]

use crate::{CaptureError, NativeCaptureErrorCode};

use super::{ffmpeg_failure_detail, os_release_value, report_value};

#[test]
fn ffmpeg_failure_detail_preserves_executable_errors() {
    let error = CaptureError::Native {
        code: NativeCaptureErrorCode::FfmpegUnavailable,
        message: "failed to execute /opt/ffmpeg".into(),
    };
    assert_eq!(
        ffmpeg_failure_detail(&error),
        "failed to execute /opt/ffmpeg"
    );
}

#[test]
fn ffmpeg_failure_detail_distinguishes_encoder_errors() {
    let error = CaptureError::Native {
        code: NativeCaptureErrorCode::FfmpegEncoderUnavailable,
        message: "FFmpeg has no working supported encoder".into(),
    };
    assert_eq!(
        ffmpeg_failure_detail(&error),
        "FFmpeg has no working supported encoder"
    );
}

#[test]
fn ffmpeg_failure_detail_retains_non_native_context() {
    let error = CaptureError::Backend("capability probe failed".into());
    assert_eq!(
        ffmpeg_failure_detail(&error),
        "backend error: capability probe failed"
    );
}

#[test]
fn os_release_parser_accepts_quoted_and_plain_values() {
    assert_eq!(
        os_release_value(
            "ID=debian\nPRETTY_NAME=\"Debian GNU/Linux 13 (trixie)\"",
            "PRETTY_NAME"
        ),
        Some("Debian GNU/Linux 13 (trixie)".into())
    );
    assert_eq!(
        os_release_value("ID=debian\nVERSION_ID=13", "VERSION_ID"),
        Some("13".into())
    );
}

#[test]
fn os_release_parser_rejects_missing_empty_and_prefix_keys() {
    assert_eq!(os_release_value("ID=debian", "PRETTY_NAME"), None);
    assert_eq!(os_release_value("PRETTY_NAME=\"\"", "PRETTY_NAME"), None);
    assert_eq!(
        os_release_value("NOT_PRETTY_NAME=Debian", "PRETTY_NAME"),
        None
    );
}

#[test]
fn os_release_parser_decodes_safe_standard_escapes() {
    assert_eq!(
        os_release_value(
            "PRETTY_NAME=\"Beam \\\"Linux\\\" \\\\ Test\"",
            "PRETTY_NAME"
        ),
        Some(r#"Beam "Linux" \ Test"#.into())
    );
}

#[test]
fn report_values_remove_control_characters_and_surrounding_space() {
    assert_eq!(
        report_value("  GNOME\nDesktop\t  "),
        Some("GNOMEDesktop".into())
    );
    assert_eq!(report_value("\n\t"), None);
}

#[test]
fn report_values_are_bounded_for_safe_issue_reports() {
    assert_eq!(
        report_value(&"x".repeat(256)).map(|value| value.len()),
        Some(128)
    );
}
