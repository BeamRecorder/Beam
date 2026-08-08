<div align="center">
  <img src="./public/brand/BeamIcon.webp" alt="Beam" width="80" height="80" />
  <h1>Beam</h1>
  <p>A Screen Recorder for clear, polished product demo, similar to Recordly or ScreenStudio.</p>
  <p>
    <a href="https://github.com/ExtraBinoss/Beam/releases/latest">Download Beam for Windows or macOS</a>
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

Beam is currently available for Windows and macOS. (Linux support is not made yet)

> [!NOTE]
> **🛠️ macOS Notice ("Beam is damaged and cannot be opened")**
>
> If macOS displays a message stating the app is damaged and cannot be opened, run the following command in **Terminal** (after moving the app into the `/Applications` folder) to remove the macOS quarantine flag:
>
> ```bash
> xattr -cr /Applications/Beam.app
> ```
>
> **Alternative via macOS System Settings:**
>
> 1. Go to **System Settings > Privacy & Security**.
> 2. Scroll down to the **Security** section.
> 3. Click **"Open Anyway"** to allow Beam to launch.

## Developer documentation

If you want to run Beam locally or contribute to the project, start with the guide for your platform:

- [Windows development](./docs/dev/windows.md)
- [macOS development](./docs/dev/mac.md)

The repository's engineering guidelines are linked from both guides.

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
