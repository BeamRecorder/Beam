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

## Rust test and coverage tooling

Rust tests use Nextest. The mandatory 85% source-line coverage gate uses `cargo-llvm-cov`, Nextest, and Python 3.11 or newer:

```bash
rustup component add llvm-tools-preview
cargo install cargo-nextest
cargo install cargo-llvm-cov
```

On Windows, run the same commands in PowerShell and use `py -3` for the Python checks. On macOS and Linux, use `python3`. Configure a shared Cargo target directory before running Rust checks; do not create a separate `target/` directory in each checkout. `bun run rust-test:coverage` uses the configured target directory, runs Nextest once, and checks the workspace and every crate.
