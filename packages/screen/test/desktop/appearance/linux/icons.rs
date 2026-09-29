#[allow(dead_code)]
#[path = "../../../../src/desktop/appearance/linux/icons.rs"]
mod implementation;

const FIXTURE: &str = "BEAM_ICON_TEST_FIXTURE";
const TEST: &str = "desktop::checks::appearance::linux::icons::icon_settings_restore_only_the_original_supported_desktop_choice";

#[test]
fn icon_settings_restore_only_the_original_supported_desktop_choice() {
    if let Ok(case) = std::env::var(FIXTURE) {
        let setting = implementation::setting().unwrap();
        if matches!(case.as_str(), "visible" | "hidden" | "mate") {
            let setting = setting.unwrap();
            setting.hide().unwrap();
            setting.restore().unwrap();
        } else if case == "write-error" {
            assert!(setting.unwrap().hide().is_err());
        } else {
            assert!(setting.is_none());
        }
        return;
    }
    // Spawn a test child with a private command path; never write user gsettings.
    for (case, desktop, expected) in [
        ("visible", "X-Cinnamon", "true"),
        ("hidden", "Cinnamon", "false"),
        ("mate", "MATE", "true"),
        ("unwritable", "Cinnamon", ""),
        ("missing-key", "Cinnamon", ""),
        ("bad-value", "Cinnamon", ""),
        ("missing-schema", "Cinnamon", ""),
        ("unsupported", "GNOME", ""),
        ("write-error", "Cinnamon", ""),
    ] {
        let directory = tempfile::tempdir().unwrap();
        let command = directory.path().join("gsettings");
        std::fs::write(&command, r#"#!/usr/bin/python3
import os, sys
case = os.environ['BEAM_ICON_TEST_FIXTURE']
args = sys.argv[1:]
with open(os.environ['BEAM_ICON_TEST_LOG'], 'a') as log:
    log.write(' '.join(args) + '\n')
if case == 'missing-schema': sys.exit(1)
if args[0] == 'list-keys': print('unrelated' if case == 'missing-key' else 'show-desktop-icons')
elif args[0] == 'writable': print('false' if case == 'unwritable' else 'true')
elif args[0] == 'get': print('invalid' if case == 'bad-value' else 'false' if case == 'hidden' else 'true')
elif args[0] == 'set' and case == 'write-error': sys.exit(1)
"#).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&command, std::fs::Permissions::from_mode(0o700)).unwrap();
        let log = directory.path().join("log");
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", TEST])
            .env(FIXTURE, case)
            .env("XDG_CURRENT_DESKTOP", desktop)
            .env("PATH", directory.path())
            .env("BEAM_ICON_TEST_LOG", &log)
            .output()
            .unwrap();
        assert!(
            status.status.success(),
            "{case}: {}",
            String::from_utf8_lossy(&status.stdout)
        );
        let commands = std::fs::read_to_string(log).unwrap_or_default();
        if expected.is_empty() {
            assert!(
                !commands.lines().any(|line| line.starts_with("set ")) || case == "write-error"
            );
        } else {
            let schema = if case == "mate" {
                "org.mate.background"
            } else {
                "org.nemo.desktop"
            };
            assert!(commands.contains(&format!("set {schema} show-desktop-icons false\nset {schema} show-desktop-icons {expected}\n")));
        }
    }
}

#[test]
fn missing_gsettings_is_reported_as_unsupported() {
    if std::env::var(FIXTURE).as_deref() == Ok("absent-command") {
        assert!(implementation::setting().unwrap().is_none());
        return;
    }
    let directory = tempfile::tempdir().unwrap();
    let status = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "desktop::checks::appearance::linux::icons::missing_gsettings_is_reported_as_unsupported"])
        .env(FIXTURE, "absent-command").env("XDG_CURRENT_DESKTOP", "Cinnamon").env("PATH", directory.path()).status().unwrap();
    assert!(status.success());
}
