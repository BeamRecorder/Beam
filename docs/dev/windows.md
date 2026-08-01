# Windows development

This guide covers the basic local development and verification workflow for Beam on Windows. Run the commands from the repository root in PowerShell.

## Prerequisites

- Node.js 22 or newer with npm
- [Rust stable with the MSVC toolchain](./INSTALL_RUST.md)
- Git

Install the project dependencies once after cloning or when the lockfile changes:

```powershell
npm ci
```

## Run Beam locally

Use two PowerShell terminals. Keeping the Vite server running separately lets Electron start as soon as its native capture engine is ready.

In the first terminal, start the Vite server:

```powershell
npm run dev
```

In a second terminal, start Electron:

```powershell
npm run electron:dev
```

Keep both terminals open while developing. Stop the processes with `Ctrl+C`.

## Build a Windows executable

Create the Windows NSIS installer without publishing a release:

```powershell
npm run electron:build -- --win nsis --publish never
```

The installer and its build metadata are written to `dist_electron/`.

## Tests and coverage

Run the JavaScript tests, the Vitest suite with coverage, and the TypeScript check with:

```powershell
npm run test
npm run test:coverage
npm run typecheck
```

The TypeScript coverage gate is 90% for statements, branches, functions, and lines. Rust changes should also be checked with:

```powershell
npm run rust-test
npm run rust-test:coverage
```

## Before changing code

Read and follow the repository guidelines:

- [UI guidelines](../UI.md)
- [Architecture guidelines](../ARCHITECTURE.md)
- [Code quality guidelines](../CODE_QUALITY.md)
- [Electron window guidance](../electron_window.md)

## Publish a release

1. Update `package.json` to a new stable semantic version, for example `0.1.1`.
2. Commit the change with a message beginning with `[RELEASE]` and push it from the `ExtraBinoss` account.

The GitHub Actions workflow checks that the version is newer than the latest GitHub Release, then publishes the Windows installer and macOS packages.
