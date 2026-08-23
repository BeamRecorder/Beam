# macOS development

This guide covers the basic local development and verification workflow for Beam on macOS. Run the commands from the repository root in Terminal.

## Prerequisites

- macOS 13 or newer
- Node.js 22 or newer and Bun 1.4.0
- [Rust stable](./INSTALL_RUST.md) for native rebuilds
- Xcode Command Line Tools
- Git

Install the project dependencies once after cloning or when the lockfile changes:

```bash
bun install --frozen-lockfile
```

## Run Beam locally

Use two Terminal windows. Keeping the Vite server running separately lets Electron start as soon as its native capture engine is ready.

In the first terminal, start the Vite server:

```bash
bun run dev
```

In a second terminal, start Electron:

```bash
bun run electron:dev
```

Keep both terminals open while developing. Stop the processes with `Ctrl+C`.

On first launch, grant Beam the macOS permissions it requests for Screen Recording, Microphone, and Camera when those sources are enabled.

`bun run electron:dev` checks Cargo before starting. When Cargo is available, it rebuilds the engine and stops if compilation fails. Without Cargo, it looks for the exact application version and Apple Silicon architecture in [`packages/native-recorder`](../../packages/native-recorder/README.md). If the engine is missing in an interactive terminal, confirm the verified download with `Y`; answer `N` to stop. A non-interactive process never prompts and downloads only when `BEAM_DOWNLOAD_CAPTURE_ENGINE=1` is set explicitly.

## Build a macOS executable

Create a DMG without publishing a release:

```bash
bun run electron:build -- --mac dmg --publish never
```

To create both a DMG and a ZIP archive:

```bash
bun run electron:build -- --mac dmg zip --publish never
```

The packages and their build metadata are written to `dist_electron/`. Build macOS installers on macOS.

## Tests and coverage

Run the JavaScript tests, the Vitest suite with coverage, and the TypeScript check with:

```bash
bun run test
bun run test:coverage
bun run typecheck
```

The TypeScript coverage gate is 90% for statements, branches, functions, and lines. For Rust changes, run the native test suite directly:

```bash
cargo test --workspace --all-features
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

## Before changing code

Read and follow the repository guidelines:

- [UI guidelines](../UI.md)
- [Architecture guidelines](../ARCHITECTURE.md)
- [Code quality guidelines](../CODE_QUALITY.md)
- [Electron window guidance](../electron_window.md)
