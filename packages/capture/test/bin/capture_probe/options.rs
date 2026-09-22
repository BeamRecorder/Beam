#![allow(clippy::expect_used)]

use capture::model::{PortalSourceKind, RecordingSettings};

use super::super::parse_linux_native_capture_options;

fn parse(arguments: &[&str]) -> Result<(u64, PortalSourceKind, usize), capture::CaptureError> {
    parse_linux_native_capture_options(arguments.iter().map(|value| (*value).to_owned()))
}

#[test]
fn native_probe_accepts_both_duration_boundaries_and_default_options() {
    for duration in [1, 300] {
        let text = duration.to_string();
        let parsed =
            parse(&["linux-native-capture", "--duration-seconds", &text]).expect("valid options");
        assert_eq!(
            parsed,
            (
                duration,
                PortalSourceKind::MonitorOrWindow,
                RecordingSettings::default().queue_capacity
            )
        );
    }
    let without_kind_value =
        parse(&["--duration-seconds", "1", "--kind"]).expect("missing kind defaults");
    assert_eq!(without_kind_value.1, PortalSourceKind::MonitorOrWindow);
    let without_queue_value =
        parse(&["--duration-seconds", "1", "--queue-capacity"]).expect("missing queue defaults");
    assert_eq!(
        without_queue_value.2,
        RecordingSettings::default().queue_capacity
    );
}

#[test]
fn native_probe_rejects_duration_out_of_range_or_bad_syntax() {
    for duration in ["0", "301", "99999"] {
        let error = parse(&["--duration-seconds", duration]).expect_err("out of range");
        assert!(
            matches!(error, capture::CaptureError::InvalidConfiguration(_)),
            "{duration}: {error}"
        );
    }
    for duration in ["", "-1", "1.5", "nan", "18446744073709551616"] {
        let error = parse(&["--duration-seconds", duration]).expect_err("invalid integer");
        assert!(
            matches!(error, capture::CaptureError::Protocol(_)),
            "{duration}: {error}"
        );
    }
    for arguments in [vec![], vec!["--kind", "window"], vec!["--duration-seconds"]] {
        assert!(
            matches!(parse(&arguments), Err(capture::CaptureError::Protocol(_))),
            "{arguments:?}"
        );
    }
}

#[test]
fn native_probe_maps_each_kind_and_reports_unknown_kind() {
    for (input, expected) in [
        ("both", PortalSourceKind::MonitorOrWindow),
        ("monitor", PortalSourceKind::Monitor),
        ("window", PortalSourceKind::Window),
    ] {
        let parsed = parse(&["--kind", input, "--duration-seconds", "1"]).expect("kind");
        assert_eq!(parsed.1, expected, "{input}");
    }
    for input in ["", "MONITOR", "display", "both "] {
        let error = parse(&["--duration-seconds", "1", "--kind", input]).expect_err("invalid kind");
        assert!(
            error.to_string().contains("unknown Portal source kind"),
            "{input:?}: {error}"
        );
    }
}

#[test]
fn native_probe_validates_queue_capacity_and_preserves_first_duplicate() {
    for queue in [1, 2, 300, usize::MAX] {
        let text = queue.to_string();
        assert_eq!(
            parse(&["--duration-seconds", "1", "--queue-capacity", &text])
                .expect("queue")
                .2,
            queue
        );
    }
    let zero =
        parse(&["--duration-seconds", "1", "--queue-capacity", "0"]).expect_err("zero queue");
    assert!(matches!(
        zero,
        capture::CaptureError::InvalidConfiguration(_)
    ));
    for invalid in ["", "-1", "3.5", "invalid"] {
        assert!(
            matches!(
                parse(&["--duration-seconds", "1", "--queue-capacity", invalid]),
                Err(capture::CaptureError::Protocol(_))
            ),
            "{invalid:?}"
        );
    }
    assert_eq!(
        parse(&[
            "--duration-seconds",
            "1",
            "--queue-capacity",
            "2",
            "--queue-capacity",
            "0"
        ])
        .expect("first queue wins")
        .2,
        2
    );
    assert_eq!(
        parse(&[
            "--duration-seconds",
            "1",
            "--kind",
            "window",
            "--kind",
            "bad"
        ])
        .expect("first kind wins")
        .1,
        PortalSourceKind::Window
    );
}

#[test]
fn native_probe_checks_duration_before_later_options() {
    let error = parse(&[
        "--duration-seconds",
        "0",
        "--kind",
        "invalid",
        "--queue-capacity",
        "0",
    ])
    .expect_err("duration first");
    assert!(error.to_string().contains("duration"));
    let error = parse(&[
        "--duration-seconds",
        "1",
        "--kind",
        "invalid",
        "--queue-capacity",
        "0",
    ])
    .expect_err("kind second");
    assert!(error.to_string().contains("Portal source kind"));
}
