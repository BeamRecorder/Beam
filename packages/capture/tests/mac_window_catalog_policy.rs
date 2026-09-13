// The native macOS module is target-gated, so include this pure policy directly
// to exercise it in the Linux quality job as well as macOS builds.
#[path = "../src/screen/mac/catalog_policy.rs"]
mod catalog_policy;

use catalog_policy::is_user_window_candidate;

#[test]
fn normal_application_windows_are_candidates() {
    for (title, application_name) in [
        ("Beam documentation", "Google Chrome"),
        ("Untitled project", "Beam Editor"),
        ("Beam team", "Discord"),
    ] {
        assert!(is_user_window_candidate(
            0,
            title,
            application_name,
            1280.0,
            720.0,
        ));
    }
}

#[test]
fn system_and_floating_window_layers_are_rejected() {
    for window_layer in [3, 24, 25, 101] {
        assert!(!is_user_window_candidate(
            window_layer,
            "System UI",
            "SystemUIServer",
            1280.0,
            720.0,
        ));
    }
}

#[test]
fn missing_window_titles_are_rejected() {
    for title in ["", " ", "\t", "\n", "  \t\n  "] {
        assert!(!is_user_window_candidate(
            0,
            title,
            "Beam Editor",
            1280.0,
            720.0,
        ));
    }
}

#[test]
fn missing_application_names_are_rejected() {
    for application_name in ["", " ", "\t", "\n", "  \t\n  "] {
        assert!(!is_user_window_candidate(
            0,
            "Untitled project",
            application_name,
            1280.0,
            720.0,
        ));
    }
}

#[test]
fn invalid_window_dimensions_are_rejected() {
    let invalid_dimensions = [
        (0.0, 720.0),
        (1280.0, 0.0),
        (-1.0, 720.0),
        (1280.0, -1.0),
        (f64::NAN, 720.0),
        (1280.0, f64::NAN),
        (f64::INFINITY, 720.0),
        (1280.0, f64::INFINITY),
        (f64::NEG_INFINITY, 720.0),
        (1280.0, f64::NEG_INFINITY),
    ];

    for (width, height) in invalid_dimensions {
        assert!(!is_user_window_candidate(
            0,
            "Untitled project",
            "Beam Editor",
            width,
            height,
        ));
    }
}
