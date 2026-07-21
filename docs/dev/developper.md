# Developer Documentation

Welcome to the DemoRecorder developer guide. This document outlines how to set up the development environment, build the project, run tests, and manage dependencies.

## Prerequisites & Dependencies

### Windows & macOS
Out of the box, no special system dependencies are required for building and running the project.

### Linux
To compile the native Rust multi-track capture engine (specifically for system-audio handling), you must install the ALSA development headers and `pkg-config`:
```bash
sudo apt update
sudo apt install -y libasound2-dev pkg-config
```

---

## Getting Started & Build Setup

1. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

2. **Compile the Native Rust Capture Engine**:
   ```bash
   npm run capture:build-dev
   # Or directly via cargo:
   # cargo build -p capture --bin capture-engine
   ```

3. **Start the Development Server**:
   ```bash
   npm run dev:all
   ```
   This script concurrent-spawns both the Vite frontend server and the Electron application instance.

---

## Testing & Quality Gates

### TypeScript / Vue Tests
We use **Vitest** for testing our frontend, store, and Vue component states.

- **Run all tests**:
   ```bash
   npm run test
   ```

- **Run tests with coverage**:
   ```bash
   npm run test:coverage
   ```
   *Note: Code quality guidelines mandate a minimum coverage threshold of 90% across statements, branches, functions, and lines for tested code.*

### Rust Tests
We use Cargo to verify native capture engine behaviors.

- **Run Rust tests**:
   ```bash
   cargo test --workspace --all-features
   ```

- **Format and Lint checks**:
   ```bash
   cargo fmt --all --check
   cargo clippy --workspace --all-targets --all-features -- -D warnings
   ```
