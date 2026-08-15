<div align="center">
  <img src="./public/brand/BeamIcon.webp" alt="Beam" width="128" height="128" />
  <h1>Beam</h1>
  <p>A Screen Recorder for clear, polished product demo, similar to Recordly or ScreenStudio.</p>
  <p>
    <a href="https://github.com/ExtraBinoss/Beam/releases/latest">Download Beam for Windows, macOS, or Linux</a>
    ·
    <a href="https://discord.gg/6Q6v2xUCB"><img src="./public/discord_svg.svg" alt="Discord" width="18" height="20" valign="middle" /> Join Beam on Discord</a>
  </p>
</div>

## 🎥 Demo

[BeamDemo.webm](https://github.com/user-attachments/assets/8fb3851c-eccd-4c1a-94b8-3c4d6e0250b9)

## 📸 Screenshots

<p align="center">
  <img src="./docs/assets/screenshot-1.png" alt="Beam Recording" width="100%" />
  <br /><br />
  <img src="./docs/assets/screenshot-2.png" alt="Beam Editor" width="100%" />
</p>

## 🚀 Features

### 🎬 Capture
- 🖥️ **Display, Window, or Custom Crop** — Record an entire monitor, snap to a single app window, or drag a custom region.
- 🎙️ **Separate Audio Tracks** — Record microphone voiceover and desktop system audio concurrently on independent tracks.
- 🎥 **Webcam Overlay** — Configurable picture-in-picture camera bubble with live positioning and shapes.
- 📖 **Floating Teleprompter** — Built-in, transparent script prompter so you never lose your flow while recording.

### ✨ Editor & Styling
- 🔍 **Smart Zooms** — Automatic focus on mouse clicks and keyboard shortcuts with smooth spring animations, or manual keyframing.
- 🖱️ **Cursor Smoothing & Restyling** — Motion is tracked natively with sub-pixel precision; change cursor sizes, replace assets, add click rings, or smooth out jittery paths.
- 📝 **Local AI Captions** — Speech-to-text powered by local on-device Whisper models—no cloud uploads, subscriptions, or API keys.
- 🎨 **Canvas Backdrops** — Style recordings with wallpaper backgrounds, gradients, customizable padding, drop shadows, and window border radius.
- ⏱️ **Multi-Track Timeline** — Non-destructive video, audio, and subtitle editing with precise playhead scrubbing and snapping.

### ⚡ Performance & Output
- 🦀 **Rust Capture Engine** — Low-overhead native capture designed to stay out of the way of your CPU and GPU while recording 60 fps footage.
- 📦 **Direct Export** — Fast rendering to WebM or MP4 up to 4K resolution with preset bitrate controls.

Have ideas or feature requests? Open an issue or join the discussion on [Discord](https://discord.gg/6Q6v2xUCB).

## 🌍 Availability

Beam is available for Windows, macOS, and Linux.

<details>
<summary><strong>🪟 Windows</strong></summary>

- Distributed as a native Windows installer.
- Screen, window, region, camera, microphone, and system-audio recording are supported.
- Overlay positions and sizes can be saved and restored.

</details>

<details>
<summary><strong>🍏 macOS</strong></summary>

- Distributed as a DMG for Apple Silicon Macs running macOS 13 or newer.
- Screen Recording, Microphone, and Camera permissions must be granted when those sources are used.
- Overlay positions and sizes can be saved and restored.

> [!NOTE]
> **"Beam is damaged and cannot be opened"**
>
> After moving Beam into `/Applications`, remove the macOS quarantine flag in Terminal:
>
> ```bash
> xattr -cr /Applications/Beam.app
> ```
>
> Alternatively, go to **System Settings > Privacy & Security**, scroll to **Security**, and click **Open Anyway**.

</details>

<details>
<summary><strong>🐧 Linux</strong></summary>

- Distributed as AppImage, DEB, and RPM packages.
- Screen and window capture uses XDG Desktop Portal, PipeWire, and FFmpeg. The system picker requests explicit permission when a capture starts.
- Recording click and keyboard-shortcut metadata requires explicit Polkit consent.
- On X11, overlay positions and sizes can be saved and restored.
- On native Wayland, overlay sizes can be saved, but positions cannot. Wayland prevents applications from reading global window coordinates, so Electron reports `x: 0, y: 0` and Beam cannot restore the camera overlay or teleprompter position.
- Beam does not force XWayland as a workaround because it can be incompatible with some GPU and X11 configurations.

</details>

## 🌐 Supported Languages

The interface is available in 15 languages:

- 🇺🇸 English
- 🇫🇷 Français
- 🇪🇸 Español
- 🇩🇪 Deutsch
- 🇷🇺 Русский
- 🇧🇬 Български
- 🇨🇳 简体中文
- 🇰🇷 한국어
- 🇧🇷 Português (Brasil)
- 🇯🇵 日本語
- 🇮🇹 Italiano
- 🇵🇱 Polski
- 🇹🇼 繁體中文
- 🇮🇳 हिन्दी
- 🇻🇳 Tiếng Việt

## 🛠️ Developer documentation

If you want to run Beam locally or contribute to the project, start with the guide for your platform:

- 📖 [Contributing Guide](./docs/dev/CONTRIBUTING.md)
- 🪟 [Windows development](./docs/dev/windows.md)
- 🍏 [macOS development](./docs/dev/mac.md)
- 🐧 [Linux development](./docs/dev/linux.md)

The repository's engineering guidelines are linked from each guide.

## 💬 Join the Beam community

Have feedback, ideas, or questions? Join the Beam community on Discord and follow the project on GitHub.

<p>
  <a href="https://discord.gg/6Q6v2xUCB"><img src="./public/discord_svg.svg" alt="Discord" width="18" height="20" valign="middle" /> Join Beam on Discord</a>
  ·
  <a href="https://github.com/ExtraBinoss/Beam"><img src="./public/github.svg" alt="GitHub" width="18" height="18" valign="middle" /> Beam on GitHub</a>
</p>

## 💖 Acknowledgements

Beam takes inspiration from [Recordly](https://github.com/webadderallorg/Recordly/). Some ideas are inspired by it; Beam is not a fork, it is a complete rewrite.

Released under the [MIT License](./LICENSE).
