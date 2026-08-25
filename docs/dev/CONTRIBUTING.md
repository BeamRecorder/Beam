# Contributing to Beam

This document explains how to contribute to **Beam**, either using an AI assistant in autonomous mode or following the manual step-by-step developer guide.

---

## 🤖 AI Assistant Prompt (Copy & Paste)

Copy and paste the prompt below directly into your AI coding assistant (Cursor, Claude Code, Antigravity, Copilot Workspace, etc.) to set up and develop autonomously:

```markdown
You are an autonomous senior software engineer working on Beam (https://github.com/BeamRecorder/Beam).

Follow these exact steps to prepare your workspace, fork the repository, and deliver changes:

1. **GitHub CLI & Authentication**:
   - Ensure the GitHub CLI (`gh`) is available (https://cli.github.com/).
   - Check authentication status using `gh auth status`. If not authenticated, prompt the user or run `gh auth login`.

2. **Fork & Clone**:
   - Fork and clone the upstream repository:
     `gh repo fork BeamRecorder/Beam --clone`
   - Enter the cloned directory:
     `cd Beam`

3. **Branch Convention**:
   - Create and checkout a dedicated branch based on the goal:
     - Features: `feat/<short-descriptive-name>`
     - Fixes: `fix/<short-descriptive-name>`
     - Performance: `perf/<short-descriptive-name>`
     - Refactoring: `refactor/<short-descriptive-name>`
     - Documentation: `docs/<short-descriptive-name>`
       Example: `git checkout -b feat/custom-watermark`

4. **Engineering Guidelines**:
   - Before making any code changes, read the contracts:
     - `AGENTS.md` & `docs/ARCHITECTURE.md` (Electron security boundary & Rust capture engine)
     - `docs/UI.md` (Design tokens, reusable components in `src/components/ui/`, no `:deep` overrides)
     - `docs/CODE_QUALITY.md` (Max 500 lines per file, types in dedicated files, small units)
     - `docs/electron_window.md` (Mandatory before touching window sizes, transparent regions, or IPC)

5. **Environment & Dependencies**:
   - Run `bun install` to install frontend & Electron packages.
   - If the user does not have Rust installed, you can still launch the app with `bun run dev`, but the Rust capture engine will never be rebuilded (and will be downloaded via Internet).
   - Verify Rust toolchain availability (`cargo --version`). Refer to `docs/dev/INSTALL_RUST.md` if Rust is missing.

6. **Development & Verification**:
   - Run localized/targeted tests for changed code:
     - Vue/TypeScript: `bunx vitest run <path-to-test>`
     - Electron/Node: `node --test <path-to-test>`
     - Typecheck: `bunx vue-tsc --noEmit`
   - Run `bun run build` to validate end-to-end compilation before submitting.

7. **Submitting Changes**:
   - Use conventional commit messages (`feat: ...`, `fix: ...`, `refactor: ...`).
   - Push your branch and open a PR:
     `git push -u origin <branch-name>`
     `gh pr create --fill`
```

---

## 📖 Developer Guide (Manual Setup)

### 1. Prerequisites

Make sure you have the following installed on your machine:

- **Node.js**: `v20.x` or later (LTS recommended)
- **Bun**: `v1.4.0`
- **Rust Toolchain**: `cargo` & `rustc` (see [docs/dev/INSTALL_RUST.md](INSTALL_RUST.md))
- **GitHub CLI (`gh`)**: Install from [https://cli.github.com/](https://cli.github.com/)
- **Git**: Standard git CLI

OS-specific setup instructions:

- [Windows Guide](windows.md)
- [macOS Guide](mac.md)
- [Linux Guide](linux.md)

---

### 2. Forking and Cloning the Repository

1. **Authenticate with GitHub CLI**:

   ```bash
   gh auth login
   ```

2. **Fork and clone Beam**:
   ```bash
   gh repo fork BeamRecorder/Beam --clone
   cd Beam
   ```

---

### 3. Branch Naming Conventions

Always create a new branch from `main` for your work. Use standard semantic prefixes:

| Type              | Prefix      | Example                       |
| :---------------- | :---------- | :---------------------------- |
| **New Feature**   | `feat/`     | `feat/export-gif-format`      |
| **Bug Fix**       | `fix/`      | `fix/timeline-snap-alignment` |
| **Performance**   | `perf/`     | `perf/waveform-decoding`      |
| **Refactoring**   | `refactor/` | `refactor/audio-engine`       |
| **Documentation** | `docs/`     | `docs/contributing-guide`     |

```bash
git checkout -b feat/your-feature-name
```

---

### 4. Installing Dependencies & Running Locally

1. **Install Bun dependencies**:

   ```bash
   bun install
   ```

2. **Start Development Environment**:
   ```bash
   bun run dev
   ```
   This compiles the Rust native capture addon and starts both Vite and Electron in development mode.

---

### 5. Repository Guidelines & Code Quality Contracts

Before contributing, make sure your code aligns with our architecture and style rules:

- **UI Primitives**: Always reuse existing UI components from [`src/components/ui/`](../../src/components/ui/) (`Button`, `Select`, `Popover`, `Dialog`, `Slider`, `Switch`, `Badge`, `CopyButton`, `DeleteItem`, etc.). Do not write ad-hoc styled buttons or custom controls.
- **No `:deep` CSS Selectors**: Avoid `:deep` selectors in scoped Vue component styles.
- **File Length**: No single source file should exceed **500 lines**. Split larger files into focused composables, modules, or sub-components.
- **Type Definitions**: Place shared TypeScript interfaces and types in dedicated `.ts` files (e.g. `*-types.ts`), not inside Vue components.
- **Electron Windows**: When working on transparent windows, sizes, or shadows, adhere strictly to [`docs/electron_window.md`](../electron_window.md).

---

### 6. Testing & Validation

Run focused tests directly related to the code you modified:

- **Vue / Frontend tests**:
  ```bash
  bunx vitest run src/components/video-editor/timeline/tests/
  ```
- **Electron / Node tests**:
  ```bash
  node --test test/editor-window.test.cjs
  ```
- **Type Checking**:
  ```bash
  bunx vue-tsc --noEmit
  ```
- **Production Build Validation**:
  ```bash
  bun run build
  ```

---

### 7. Submitting a Pull Request

1. **Commit your changes using Conventional Commits**:

   ```bash
   git add .
   git commit -m "feat(timeline): add multi-track snapping guides"
   ```

2. **Push to your fork**:

   ```bash
   git push -u origin feat/your-feature-name
   ```

3. **Create the Pull Request**:
   ```bash
   gh pr create --title "feat: multi-track snapping guides" --body "Detailed summary of changes..."
   ```
