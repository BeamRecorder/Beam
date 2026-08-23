# Linux development

Beam records screens and windows on Linux through the XDG ScreenCast Portal, PipeWire and FFmpeg. Electron never enumerates desktop sources on Linux: the source selector represents the system picker, which opens once during preparation and remains attached across pause/resume.

## Prerequisites

- Node.js 22 or newer and Bun 1.4.0
- [Rust stable](./INSTALL_RUST.md)
- Git
- a C/C++ compiler, Clang development libraries and pkg-config
- PipeWire development headers and runtime services
- FFmpeg with the MP4 muxer and either the `libx264` or `libopenh264` encoder
- XDG Desktop Portal and the backend for the active desktop environment

Install the native packages for your distribution. The commands below target GNOME; replace only the final portal backend package with `xdg-desktop-portal-kde` on KDE or `xdg-desktop-portal-wlr` on a compatible wlroots desktop. Do not install every backend indiscriminately.

### Fedora

```bash
sudo dnf install \
  gcc clang-devel pkgconf-pkg-config pipewire-devel \
  ffmpeg-free pipewire wireplumber xdg-desktop-portal \
  xdg-desktop-portal-gnome
```

Fedora's `ffmpeg-free` package provides the supported `libopenh264` encoder.

### Debian and Ubuntu

```bash
sudo apt update
sudo apt install \
  build-essential clang libclang-dev pkg-config libpipewire-0.3-dev \
  ffmpeg pipewire wireplumber xdg-desktop-portal \
  xdg-desktop-portal-gnome
```

### Arch Linux

```bash
sudo pacman -S --needed \
  base-devel clang pkgconf libpipewire pipewire wireplumber ffmpeg \
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

Start Electron from the second development terminal with:

```bash
bun run electron:dev
```

The command checks Cargo first. When Cargo is available, it builds both `capture-engine` and the filtered `beam-input-helper`, and stops if compilation fails. Without Cargo, it looks for the exact application version under `packages/native-recorder/linux/x64/`. If either native file is missing in an interactive terminal, confirm the verified download with `Y`; answer `N` to stop. Non-interactive execution never prompts and downloads only with the explicit `BEAM_DOWNLOAD_CAPTURE_ENGINE=1` opt-in.

The deterministic FFmpeg tests use a fake child process. The opt-in synthetic runtime smoke uses the actual system executable without opening the Portal picker:

```bash
cargo test -p capture --lib \
  screen::linux::ffmpeg_process_tests::system_ffmpeg_encodes_a_playable_mp4_segment \
  -- --ignored --exact
```

A real monitor/window smoke remains interactive and must be run manually because the Portal requires explicit user consent.

Click and shortcut metadata also requires explicit Polkit consent. Use **Record keyboard shortcuts** in HUD preferences. On Linux, turning this setting off disables both keyboard shortcuts and click metadata. Do not add the developer account to the `input` group: that would grant the entire Electron process broad access to every raw input device. Development, AppImage, RPM and DEB use the same filtered helper protocol and write structured events to `cursor/input.json`.

Repository rules still apply to documentation and non-capture changes:

- [UI guidelines](../UI.md)
- [Architecture guidelines](../ARCHITECTURE.md)
- [Code quality guidelines](../CODE_QUALITY.md)
- [Electron window guidance](../electron_window.md)
