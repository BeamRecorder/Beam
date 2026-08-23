# Install Rust for Beam

Beam uses the Rust stable toolchain for its native capture engine. Rust is needed for native tests and local installer builds. `bun run electron:dev` detects Cargo automatically: when Cargo is unavailable, it can use or download a versioned engine from [`packages/native-recorder`](../../packages/native-recorder/README.md) after confirmation.

## Windows

Open PowerShell and install Rustup with WinGet:

```powershell
winget install --id Rustlang.Rustup -e
```

Restart PowerShell, then select the stable MSVC toolchain:

```powershell
rustup default stable-x86_64-pc-windows-msvc
```

The MSVC linker requires Visual Studio Build Tools with the **Desktop development with C++** workload. Install it from the [Visual Studio downloads](https://visualstudio.microsoft.com/downloads/) page if it is not already available.

Verify the installation:

```powershell
rustc --version
cargo --version
rustup show
```

## macOS

Install Apple's command-line tools first:

```bash
xcode-select --install
```

Install Rustup with the official installer:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Follow the installer prompts and choose the default stable toolchain. Then load Cargo in the current terminal:

```bash
source "$HOME/.cargo/env"
```

Verify the installation:

```bash
rustc --version
cargo --version
rustup show
```

## Rust coverage tooling

The optional Rust coverage command uses `cargo-llvm-cov` and the LLVM tools component:

```bash
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov
```

On Windows, run the same commands in PowerShell. After installation, use the coverage command from the [Windows development guide](./windows.md). On macOS, use `cargo llvm-cov` directly when you need Rust coverage.
