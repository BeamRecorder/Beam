#![cfg(test)]

use super::linux::{HelperCommand, parse_helper_command};

fn parsed(arguments: &[&str]) -> Result<HelperCommand, &'static str> {
    parse_helper_command(arguments.iter().map(|argument| (*argument).to_owned()))
}

#[test]
fn parser_defaults_to_probe_only_when_no_argument_is_present() {
    assert_eq!(parsed(&[]), Ok(HelperCommand::Probe));
    assert_eq!(parsed(&["probe"]), Ok(HelperCommand::Probe));
    assert_eq!(parsed(&[""]), Err("unsupported beam-input-helper command"));
}

#[test]
fn parser_recognizes_every_supported_command_exactly() {
    for (text, expected) in [
        ("probe", HelperCommand::Probe),
        ("stream", HelperCommand::Stream),
        ("install", HelperCommand::Install),
        ("install-stream", HelperCommand::InstallStream),
        ("uninstall", HelperCommand::Uninstall),
        ("version", HelperCommand::Version),
    ] {
        assert_eq!(parsed(&[text]), Ok(expected), "{text}");
    }
}

#[test]
fn parser_rejects_unknown_case_whitespace_and_near_matches() {
    for value in [
        "",
        "Probe",
        "STREAM",
        "Version",
        " install",
        "install ",
        "install_stream",
        "install--stream",
        "un-install",
        "versions",
        "unknown",
        "\0",
        "écran",
    ] {
        assert_eq!(
            parsed(&[value]),
            Err("unsupported beam-input-helper command"),
            "{value:?}"
        );
    }
}

#[test]
fn extra_argument_is_rejected_before_command_name_validation() {
    for command in [
        "probe",
        "stream",
        "install",
        "install-stream",
        "uninstall",
        "version",
        "unknown",
        "",
    ] {
        for extra in ["", "extra"] {
            assert_eq!(
                parsed(&[command, extra]),
                Err("beam-input-helper accepts exactly one command"),
                "{command:?} {extra:?}"
            );
        }
        assert_eq!(
            parsed(&[command, "one", "two"]),
            Err("beam-input-helper accepts exactly one command")
        );
    }
}
