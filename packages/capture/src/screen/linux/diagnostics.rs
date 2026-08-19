use std::time::Duration;

use crate::model::{
    CaptureDiagnostics, FfmpegDiagnostic, LinuxCaptureDiagnostics, PortalDiagnostic,
    RequirementDiagnostic,
};

use super::{
    FfmpegCapabilities, LinuxNativeCapabilities, PortalProperties, evaluate_capabilities,
    probe_ffmpeg, probe_pipewire, probe_portal_properties,
};

pub(crate) struct LinuxCaptureProbe {
    pub capabilities: LinuxNativeCapabilities,
    pub ffmpeg: Option<FfmpegCapabilities>,
    pub diagnostics: CaptureDiagnostics,
}

pub(crate) fn probe_capture_environment(timeout: Duration) -> LinuxCaptureProbe {
    let portal_result = probe_portal_properties(timeout);
    let pipewire_available = probe_pipewire();
    let ffmpeg_result = probe_ffmpeg();
    let portal_properties = portal_result.as_ref().copied().unwrap_or_default();
    let capabilities =
        evaluate_capabilities(portal_properties, pipewire_available, ffmpeg_result.is_ok());
    let recording_available = capabilities.recording_available;
    let portal = match portal_result {
        Ok(properties) => portal_diagnostic(properties),
        Err(error) => PortalDiagnostic {
            error_code: Some(error.code().into()),
            detail: Some(
                match error.code() {
                    "portal-version-unsupported" => {
                        "The XDG ScreenCast portal is older than the minimum supported version"
                    }
                    _ => "Beam could not connect to the XDG ScreenCast portal",
                }
                .into(),
            ),
            ..PortalDiagnostic::default()
        },
    };
    let pipewire = RequirementDiagnostic {
        available: pipewire_available,
        error_code: (!pipewire_available).then(|| "pipewire-connect-failed".into()),
        detail: Some(if pipewire_available {
            "PipeWire connection succeeded".into()
        } else {
            "Beam could not connect to PipeWire".into()
        }),
    };
    let ffmpeg = match &ffmpeg_result {
        Ok(value) => FfmpegDiagnostic {
            available: true,
            encoder: Some(value.encoder.name.clone()),
            codec: Some(value.encoder.codec.clone()),
            hardware: Some(value.encoder.is_hardware()),
            detail: Some("FFmpeg provides the required MP4 muxer and a working encoder".into()),
            ..FfmpegDiagnostic::default()
        },
        Err(error) => FfmpegDiagnostic {
            error_code: Some(error.code().into()),
            detail: Some(match error.code() {
                "ffmpeg-encoder-unavailable" => {
                    "FFmpeg has no supported working encoder (libx264, libopenh264, or hardware)"
                }
                _ => "FFmpeg is unavailable or does not provide the required MP4 muxer",
            }
            .into()),
            ..FfmpegDiagnostic::default()
        },
    };
    LinuxCaptureProbe {
        capabilities,
        ffmpeg: ffmpeg_result.ok(),
        diagnostics: CaptureDiagnostics {
            platform: "linux".into(),
            linux: Some(LinuxCaptureDiagnostics {
                distribution: distribution_name(),
                distribution_id: os_release("ID"),
                distribution_like: os_release("ID_LIKE")
                    .map(|value| value.split_whitespace().map(str::to_owned).collect())
                    .unwrap_or_default(),
                distribution_version: os_release("VERSION_ID"),
                kernel: read_trimmed("/proc/sys/kernel/osrelease"),
                architecture: std::env::consts::ARCH.into(),
                desktop: desktop_name(),
                session_type: session_type(),
                display_server: display_server(),
                backend: "xdg-portal-pipewire".into(),
                portal,
                pipewire,
                ffmpeg,
                recording_available,
            }),
        },
    }
}

fn portal_diagnostic(properties: PortalProperties) -> PortalDiagnostic {
    let available = properties.version >= 2 && (properties.monitor || properties.window);
    PortalDiagnostic {
        available,
        version: Some(properties.version),
        monitor: Some(properties.monitor),
        window: Some(properties.window),
        metadata_cursor: Some(properties.metadata_cursor),
        error_code: (!available).then(|| "portal-source-unavailable".into()),
        detail: (!available)
            .then(|| "The ScreenCast portal exposes no screen or window source".into()),
    }
}

fn distribution_name() -> Option<String> {
    os_release("PRETTY_NAME")
}

fn os_release(key: &str) -> Option<String> {
    std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|contents| os_release_value(&contents, key))
}

pub(crate) fn os_release_value(contents: &str, key: &str) -> Option<String> {
    contents.lines().find_map(|line| {
        let (candidate, value) = line.split_once('=')?;
        if candidate != key {
            return None;
        }
        let value = value.trim();
        let unquoted = value
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
            .unwrap_or(value);
        report_value(&unquoted.replace("\\\"", "\"").replace("\\\\", "\\"))
    })
}

fn read_trimmed(path: &str) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|value| report_value(&value))
}

fn desktop_name() -> Option<String> {
    [
        "XDG_CURRENT_DESKTOP",
        "XDG_SESSION_DESKTOP",
        "DESKTOP_SESSION",
    ]
    .into_iter()
    .find_map(environment_value)
}

fn session_type() -> String {
    match environment_value("XDG_SESSION_TYPE")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "x11" => "x11".into(),
        "wayland" => "wayland".into(),
        _ => "unknown".into(),
    }
}

fn display_server() -> String {
    let session = session_type();
    if session != "unknown" {
        return session;
    }
    if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        "wayland".into()
    } else if std::env::var_os("DISPLAY").is_some() {
        "x11".into()
    } else {
        "unknown".into()
    }
}

fn environment_value(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .and_then(|value| report_value(&value))
}

fn report_value(value: &str) -> Option<String> {
    let normalized = value
        .trim()
        .chars()
        .filter(|character| !character.is_control())
        .take(128)
        .collect::<String>();
    (!normalized.is_empty()).then_some(normalized)
}

#[cfg(test)]
mod tests {
    use super::{os_release_value, report_value};

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
}
