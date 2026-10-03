# Launch Beam at login

Recorder Settings → General → Launch Beam at startup controls the persisted `launchAtStartup` preference. Its default is enabled, including existing preference files without the field. An explicit disabled choice survives upgrades and restarts. The UI is translated into all 15 supported languages.

The desktop host owns OS integration in `apps/desktop/electron/preferences/launch-at-startup.cjs`; reusable engine/runtime/CLI packages do not register login items or access these files. Development Settings displays the option as unavailable: launching an Electron development executable without its source server would not launch Beam correctly.

- Linux writes `com.beam.app.desktop` atomically under `$XDG_CONFIG_HOME/autostart`, or `~/.config/autostart` when XDG_CONFIG_HOME is absent or relative. The installed executable is quoted according to Desktop Entry Exec rules; AppImage installations use the persistent APPIMAGE path instead of their temporary mount. Beam keeps its existing X11/XWayland argument. Disabling writes a `Hidden=true` user override, which also overrides any system-wide entry with the same name.
- Windows uses Electron login items with the installed executable and no development arguments.
- macOS uses Electron login items. The installed app must meet the operating system’s signing and login-item approval requirements; Windows/macOS native integration still requires verification on those operating systems.

Initial registration errors are logged without preventing Beam from opening. A user-triggered change fails visibly and restores the previously saved preference when OS registration fails. Unrelated preference changes do not re-register startup. Resetting this preference restores its enabled default.

Focused checks cover Linux paths, quoting, AppImage paths, atomic publication failures, disable/re-enable, preference normalization, IPC rollback/reset, development exclusion and the Windows/macOS Electron calls. The generated Linux entry also passes `desktop-file-validate`; these checks do not simulate an actual OS login.

References: [freedesktop autostart specification](https://specifications.freedesktop.org/autostart/latest/), [Desktop Entry command-line quoting](https://specifications.freedesktop.org/desktop-entry/latest/exec-variables.html), [Electron login-item settings](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows).
