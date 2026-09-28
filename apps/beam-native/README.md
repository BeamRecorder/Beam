# Beam native capture host

This Rust application runs the Solid ARGUI launcher in a native window. Its
`beam` services call the existing `beam-media-engine` controller in process for
source discovery, recording, pause/resume, and screenshots. The editor remains
in Electron and receives a validated project ID after capture.

`src/beam/preferences.rs` reads and patches the same
`Videos/Beam/user/preferences.json` document used by Electron. The native host
also owns the tray, global shortcuts, window geometry, and separate native
windows for settings and capture overlays. Settings stay mounted in the same
process when hidden, so reopening reuses the window. Every native window embeds
Hanken Grotesk from `public/font`; its OFL license is included in the UI bundle.
Native and Electron interfaces use Concat's light/dark neutral palette with
Beam's orange accent. The palette source is documented in `beamPalette.ts`.

Build and stage the host with `node scripts/native-ui/build.mjs --stage` from
the repository root. The script builds the checked-out ARGUI submodule directly.
For a direct development session, run `bun run beam:native`.
The UI structure and focused checks are documented in
`packages/beam-ui/README.md`.

The About page uses a shared `argui-updater` transaction on service workers.
Its Beam backend reads the HTTPS GitHub `native-updates.json` feed, freezes
the selected package URL, size and SHA-256, then verifies the downloaded bytes
before handing the complete application package to ARGUI's native installer.
The release workflow publishes and validates this feed alongside AppImage,
the universal Windows installer and macOS application archives. This uses
GitHub HTTPS release metadata as its trust source; the Minisign HTTP backend
is a separate ARGUI option and is not configured here.
Checks do not download or install automatically. Source checkouts can check
and download releases; installation requires the matching packaged Beam app.
