<div align="center">
  <img src="./public/brand/BeamIcon.webp" alt="Beam" width="128" height="128" />
  <h1>Beam</h1>
  <p>A Screen Recorder for clear, polished product demo, similar to Recordly or ScreenStudio.</p>
  <p>
    <a href="https://github.com/BeamRecorder/Beam/releases/latest">Download Beam for Windows, macOS, or Linux</a>
    ·
    <a href="https://discord.gg/6Q6v2xUCB"><img src="./public/discord_svg.svg" alt="Discord" width="18" height="20" valign="middle" /> Join Beam on Discord</a>
  </p>
</div>

## 🎥 Demo

[BeamDemo.webm](https://github.com/user-attachments/assets/8fb3851c-eccd-4c1a-94b8-3c4d6e0250b9)

## 📸 Screenshots

<img width="1672" height="941" alt="Beam-showcase" src="https://github.com/user-attachments/assets/f6695cf5-d05c-4cef-811b-554115702515" />

# 🚀 Features

## Capture

- 🖥️ **Display, Window, or Custom Crop**
  Record your full screen, a specific app window, or select any area you want to capture.
- 🎙️ **Separate Audio Tracks**
  Capture your microphone and system audio at the same time, each on its own track for easier editing.
- 🎥 **Webcam Overlay**
  Add your camera on top of the recording, move it anywhere on screen, and customize its size and shape.
- 📖 **Floating Teleprompter**
  Keep your script visible while recording with a lightweight transparent teleprompter that stays out of the final capture.

## Editing & Styling

- 🔍 **Smart Zooms**
  Automatically zoom in around clicks and keyboard actions, or add your own zooms with keyframes.
- 🖱️ **Cursor Smoothing & Styling**
  Get clean, fluid cursor movement with native high-precision tracking. Adjust the size, swap the cursor style, add click effects, or smooth out shaky movement.
- 📝 **Local AI Captions**
  Generate subtitles directly on your device using Whisper. No cloud uploads, API keys, or extra subscriptions.
- 🎨 **Canvas Backdrops**
  Give your recordings a polished look with backgrounds, gradients, padding, shadows, and rounded window corners.
- ⏱️ **Multi-Track Timeline**
  Edit video, audio, and subtitles independently with precise scrubbing, snapping, and non-destructive editing.

## Performance & Export

- 🦀 **Rust Capture Engine**
  A lightweight native capture engine built for smooth 60 fps recording without putting unnecessary load on your CPU or GPU.
- 📦 **Direct Export**
  Export straight to MP4 or WebM, up to 4K, with simple bitrate presets and fast rendering.

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
  <a href="https://github.com/BeamRecorder/Beam"><img src="./public/github.svg" alt="GitHub" width="18" height="18" valign="middle" /> Beam on GitHub</a>
</p>

## 💖 Acknowledgements

Beam takes inspiration from [Recordly](https://github.com/webadderallorg/Recordly/). Some ideas are inspired by it; Beam is not a fork, it is a complete rewrite.

Released under the [MIT License](./LICENSE).
