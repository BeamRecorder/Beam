#![allow(clippy::expect_used)]

#[path = "../src/args.rs"]
mod args;

use args::{RecordArgs, ReportArgs, no_extra_arguments};

fn parse_record(values: &[&str]) -> Result<RecordArgs, String> {
    RecordArgs::parse(values.iter().map(ToString::to_string))
}

#[test]
fn recording_defaults_and_explicit_devices_parse_without_hardware() {
    let default = parse_record(&["--output", "/tmp/beam-probe"]).expect("defaults");
    assert_eq!(default.duration_seconds, 5);
    assert_eq!(default.preview_delay_ms, 0);
    assert!(!default.no_camera);
    let selected = parse_record(&[
        "--output",
        "/tmp/beam-probe",
        "--duration",
        "17",
        "--camera",
        "camera-id",
        "--microphone",
        "mic-id",
        "--system-output",
        "speaker-id",
        "--preview-delay-ms",
        "500",
    ])
    .expect("selected devices");
    assert_eq!(selected.duration_seconds, 17);
    assert_eq!(selected.camera.as_deref(), Some("camera-id"));
    assert_eq!(selected.microphone.as_deref(), Some("mic-id"));
    assert_eq!(selected.system_output.as_deref(), Some("speaker-id"));
    assert_eq!(selected.preview_delay_ms, 500);
}

#[test]
fn recording_rejects_contradictory_or_incomplete_options() {
    for values in [
        vec!["--output", "x", "--camera", "id", "--no-camera"],
        vec!["--output", "x", "--microphone", "id", "--no-microphone"],
        vec![
            "--output",
            "x",
            "--system-output",
            "id",
            "--no-system-audio",
        ],
        vec!["--output", "x", "--duration", "0"],
        vec!["--output", "x", "--duration", "abc"],
        vec!["--output", "x", "--duration"],
        vec!["--output", "x", "--preview-delay-ms"],
        vec!["--output", "x", "--preview-delay-ms", "abc"],
        vec!["--output", "x", "--preview-delay-ms", "1001"],
        vec!["--output", "x", "--no-camera", "--preview-delay-ms", "5"],
        vec!["--output", "x", "--unknown"],
    ] {
        assert!(parse_record(&values).is_err(), "accepted {values:?}");
    }
}

#[test]
fn report_and_flag_only_commands_require_exact_arguments() {
    assert!(args::USAGE.contains("--system-output DEVICE"));
    assert_eq!(
        ReportArgs::parse(["--output".into(), "session".into()].into_iter())
            .expect("report")
            .output,
        std::path::PathBuf::from("session")
    );
    for values in [vec![], vec!["--output"], vec!["--output", "x", "extra"]] {
        assert!(ReportArgs::parse(values.into_iter().map(str::to_owned)).is_err());
    }
    assert!(no_extra_arguments(std::iter::empty()).is_ok());
    assert!(no_extra_arguments(["--unknown".into()].into_iter()).is_err());
}
