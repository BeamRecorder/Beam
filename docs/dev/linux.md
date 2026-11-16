# Linux development

Beam records screens and windows on Linux through the XDG ScreenCast Portal, PipeWire and FFmpeg. On a local X11 session without a usable ScreenCast portal, Rust instead enumerates and captures X11 monitors and windows directly. Electron never uses Chromium desktop enumeration on Linux. Wayland and XWayland retain the Portal picker, which opens once during preparation and remains attached across pause/resume.

Electron windows use X11 (`--ozone-platform=x11`) on Linux, including XWayland on a Wayland desktop. This restores global window placement; HUD popovers stay within compact bounds so transparent added space cannot block desktop clicks. Capture backend selection belongs to Rust, and desktop session environment variables remain intact.

Video editor export uses WebCodecs, independently of the native capture backend. See [GPU drivers and WebCodecs export](gpu-drivers.md) for driver packages, codec/buffer checks and measured Intel results.

### Hyprland

When the portal cannot supply cursor metadata, monitor and region recording use Hidden cursor mode plus Hyprland IPC position sampling. The portal mapping ID selects the captured output, including fractional scaling, offsets and rotation. Older portals without a mapping ID require one monitor or a uniquely sized output; ambiguous outputs fail with a diagnostic rather than guessing from focus. IPC sampling runs outside the PipeWire frame callback and stops with the capture; stale positions are discarded. Native cursor shapes and separate-cursor window capture still require portal metadata. Clicks and shortcuts use the protected input helper independently.

### Cinnamon on X11

Linux Mint's default XApp portal does not implement ScreenCast. Beam uses direct X11 capture when that interface is unavailable in a local X11 session. No additional portal backend is needed for video on this path: keep the session's original `DISPLAY` and `XAUTHORITY`, and install FFmpeg with a supported H.264 encoder.

Direct capture requires RandR 1.5 and XFixes; window capture additionally requires XComposite. The existing picker lists native monitors and windows. Regions use native pixels, including scaled displays. Hidden windows are captured through their Composite pixmap; resizing preserves the negotiated video dimensions with aspect-preserving letterboxing. Closing or unmapping a selected window, losing the display connection, or changing monitor geometry stops capture with an error. Frame images are limited to 64 MiB and server reads have a two-second idle deadline.

This backend is never selected on Wayland, even when XWayland exposes `DISPLAY`, and it does not replace a Portal session after cancellation or permission denial. Audio still requires its existing PipeWire backend. Clicks and shortcuts still require the protected input helper and working Polkit; direct X11 video does not repair a broken `pkexec` installation.

## Prerequisites

Interaction recording also requires Polkit: `pkexec` on Debian/Ubuntu, `polkit` on Fedora, and an authentication agent in the desktop session. Beam's DEB/RPM declare the corresponding runtime dependency. AppImage users install that prerequisite through their distribution. The protected input helper handles Wayland and X11 alike; startup errors are available in Beam Preferences and in **Copy system information**. Include the package format and whether the authorization dialog appeared when reporting a failure.

- Node.js 22 or newer and Bun 1.4.2
- [Rust stable](./INSTALL_RUST.md)
- Git
- a C/C++ compiler, Clang development libraries and pkg-config
- PipeWire development headers and runtime services
- FFmpeg with the MP4 muxer and either the `libx264` or `libopenh264` encoder
- XDG Desktop Portal and its ScreenCast backend for Portal capture, or a local X11 server with RandR/XFixes (and Composite for windows)
- `wl-clipboard` on Wayland or `xclip` on X11 for persistent Quick Snip file copies

Install the native packages for your distribution. The commands below target GNOME; replace only the final portal backend package with `xdg-desktop-portal-kde` on KDE or `xdg-desktop-portal-wlr` on a compatible wlroots desktop. Do not install every backend indiscriminately.

### Fedora

```bash
sudo dnf install \
  gcc clang-devel pkgconf-pkg-config pipewire-devel \
  ffmpeg-free pipewire wireplumber wl-clipboard xclip xdg-desktop-portal \
  xdg-desktop-portal-gnome
```

Fedora's `ffmpeg-free` package provides the supported `libopenh264` encoder.

### Debian and Ubuntu

```bash
sudo apt update
sudo apt install \
  build-essential clang libclang-dev pkg-config libpipewire-0.3-dev \
  ffmpeg pipewire wireplumber wl-clipboard xclip xdg-desktop-portal \
  xdg-desktop-portal-gnome
```

### Arch Linux

```bash
sudo pacman -S --needed \
  base-devel clang pkgconf libpipewire pipewire wireplumber ffmpeg wl-clipboard xclip \
  xdg-desktop-portal xdg-desktop-portal-gnome
```

Install the project dependencies once after cloning or when `bun.lock` changes:

```bash
bun install --frozen-lockfile
```

Verify the native runtime before launching Beam:

```bash
pkg-config --modversion libpipewire-0.3
ffmpeg -hide_banner -muxers | grep -w mp4
ffmpeg -hide_banner -encoders | grep -E 'libx264|libopenh264'
systemctl --user --no-pager status pipewire wireplumber xdg-desktop-portal
```

FFmpeg must report:

- the `mp4` muxer;
- either the `libx264` or `libopenh264` H.264 encoder.

Beam checks these capabilities before opening the Portal picker. If FFmpeg is installed outside `PATH`, set `BEAM_FFMPEG_PATH` to its executable. A missing executable reports `ffmpeg-unavailable`; a build without either supported encoder reports `ffmpeg-encoder-unavailable`.

Start Vite and Electron together in one terminal:

```bash
bun run dev
```

The command checks Cargo first. When Cargo is available, it builds both `capture-engine` and the filtered `beam-input-helper`, and stops if compilation fails. Without Cargo, it looks for the exact application version under `packages/native-recorder/linux/x64/`. If either native file is missing in an interactive terminal, confirm the verified download with `Y`; answer `N` to stop. Non-interactive execution never prompts and downloads only with the explicit `BEAM_DOWNLOAD_CAPTURE_ENGINE=1` opt-in.

Run `bun run dev` in each worktree to test them in parallel. Chromium profiles and Vite ports are isolated automatically; projects, screenshots and preferences reuse the shared `Videos/Beam/user/` library. Use `bun run dev --session preview` for another profile in the same worktree. `Ctrl+C` stops Electron and Vite together. See the [session guide](CONTRIBUTING.md#4-installing-dependencies--running-locally) for storage locations and shortcut behavior.

The deterministic FFmpeg tests use a fake child process. The opt-in synthetic runtime smoke uses the actual system executable without opening the Portal picker:

```bash
cargo test -p capture --lib \
  screen::linux::ffmpeg_process_tests::system_ffmpeg_encodes_a_playable_mp4_segment \
  -- --ignored --exact
```

The opt-in X11 smoke requires a disposable X server and real FFmpeg. For example, start `Xvfb :98 -screen 0 800x600x24 -nolisten tcp -ac -noreset`, then run:

```bash
DISPLAY=:98 XDG_SESSION_TYPE=x11 WAYLAND_DISPLAY= \
DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/beam-no-session-bus \
BEAM_X11_TEST_DISPLAY=:98 cargo test -p capture --lib \
  screen::linux::x11::native_tests::captures_occluded_windows_regions_resize_and_encoded_pause_segments -- --ignored
```

The separate `monitors_remain_available_without_composite` test runs with `-extension Composite` on the disposable server and verifies that monitor capture does not require window capture support.

The session smoke checks actual monitor/region pixels, Composite window occlusion, resize, closed-window failure, cursor output and playable pause/resume MP4 segments. Never point the fixture at a user's desktop. Stop the disposable server afterward.

A real Portal monitor/window smoke remains interactive and must be run manually because the Portal requires explicit user consent.

Quick Snip publishes completed files through `wl-copy` on Wayland and `xclip` on X11. These tools keep the clipboard selection alive independently of Beam's windows, with no expiration or single-paste limit; replacing the clipboard ends their ownership. DEB/RPM packages declare both dependencies. Development and AppImage installations need the appropriate tool on `PATH`. Missing tools or failed publication are shown as copy errors, with the exported file retained for retry.

On Wayland compositors without a data-control protocol, `wl-copy` obtains selection access through a temporary native surface. The compositor may briefly focus that surface. Beam bounds acquisition to ten seconds and reports failure if ownership cannot be obtained; this deadline never expires a successful copy.

Click and shortcut metadata also requires Polkit authorization. Enable interaction recording once in HUD preferences; Beam retains that choice and resumes the helper automatically, including after helper updates. Quick Snip recording starts the helper as part of preparation when it requests interactions. Cancelling authorization cancels preparation, and failures remain visible without erasing saved consent. On Linux, turning this setting off disables both keyboard shortcuts and click metadata for normal recordings. Do not add the developer account to the `input` group: that would grant the entire Electron process broad access to every raw input device. Development, AppImage, RPM and DEB use the same filtered helper protocol and write structured events to `cursor/input.json`.

Repository rules still apply to documentation and non-capture changes:

- [UI guidelines](../UI.md)
- [Architecture guidelines](../ARCHITECTURE.md)
- [Code quality guidelines](../CODE_QUALITY.md)
- [Electron window guidance](../electron_window.md)
