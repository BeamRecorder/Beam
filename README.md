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

## See Beam in action

<div align="center">
  <video controls preload="metadata" width="100%" poster="./public/brand/BeamIcon.webp">
    <source src="./docs/assets/BeamDemo.webm" type="video/webm" />
    Your browser does not support video playback.
  </video>
</div>

## Features

- 🖥️ **Screen, region, or window** — record a full display, a precise area, or a single application window.
- 🖱️ **Cursor capture and replacement** — keep cursor movement accurate, then replace and style it cleanly in the editor.
- 🎙️ **Microphone audio** — add clear voice narration to your recording.
- 🔊 **System audio** — capture the sound coming from your computer.
- 🎥 **Camera overlay** — include your webcam with a presentation-ready overlay.
- 🔍 **Smart zoom** — focus attention on important moments with automatic or manual zooms.
- 📝 **Captions** — generate and edit captions directly in your project.
- 🎨 **Presentation styling** — use backgrounds, gradients, frames, and layout controls to make every recording feel intentional.
- ⚡ **Fast export** — export your finished video to WebM or MP4 at the resolution you need.
- 📖 **Teleprompter** — keep your script in view while you record.

You want more ? Open an issue or discuss it with us on our Discord ! 

## Availability

Beam is available for Windows, macOS, and Linux.

<details>
<summary><strong>Windows</strong></summary>

- Distributed as a native Windows installer.
- Screen, window, region, camera, microphone, and system-audio recording are supported.
- Overlay positions and sizes can be saved and restored.

</details>

<details>
<summary><strong>macOS</strong></summary>

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
<summary><strong>Linux</strong></summary>

- Distributed as AppImage, DEB, and RPM packages.
- Screen and window capture uses XDG Desktop Portal, PipeWire, and FFmpeg. The system picker requests explicit permission when a capture starts.
- Recording click and keyboard-shortcut metadata requires explicit Polkit consent.
- On X11, overlay positions and sizes can be saved and restored.
- On native Wayland, overlay sizes can be saved, but positions cannot. Wayland prevents applications from reading global window coordinates, so Electron reports `x: 0, y: 0` and Beam cannot restore the camera overlay or teleprompter position.
- Beam does not force XWayland as a workaround because it can be incompatible with some GPU and X11 configurations.

</details>

The interface is available in 14 languages:

- English
- Français
- Español
- Deutsch
- Русский
- Български
- 简体中文
- 한국어
- Português (Brasil)
- 日本語
- Italiano
- Polski
- 繁體中文
- हिन्दी

## Developer documentation

If you want to run Beam locally or contribute to the project, start with the guide for your platform:

- [Windows development](./docs/dev/windows.md)
- [macOS development](./docs/dev/mac.md)
- [Linux development](./docs/dev/linux.md)

The repository's engineering guidelines are linked from each guide.

## Join the Beam community

Have feedback, ideas, or questions? Join the Beam community on Discord and follow the project on GitHub.

<p>
  <a href="https://discord.gg/6Q6v2xUCB"><img src="./public/discord_svg.svg" alt="Discord" width="18" height="20" valign="middle" /> Join Beam on Discord</a>
  ·
  <a href="https://github.com/ExtraBinoss/Beam"><img src="./public/github.svg" alt="GitHub" width="18" height="18" valign="middle" /> Beam on GitHub</a>
</p>

## Acknowledgements

Beam takes inspiration from [Recordly](https://github.com/webadderallorg/Recordly/). Some ideas are inspired by it; Beam is not a fork, it is a complete rewrite.

Released under the [MIT License](./LICENSE).
