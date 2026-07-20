# Repository Guidance

All contributors and coding agents must read the following documents before changing the repository:

- [UI guidelines](docs/UI.md)
- [Architecture guidelines](docs/ARCHITECTURE.md)
- [Code quality guidelines](docs/CODE_QUALITY.md)

These documents are part of the repository's engineering contract. If an implementation conflicts with them, update the design or ask for clarification before adding the code.

## Build :
You are in a WSL envrionnement, if you use `npm` or `cargo`, prefix it via powershell.exe

## Non-negotiable defaults

- Keep UI code consistent with `docs/UI.md`: use the existing `src/components/ui/` primitives, Lucide icons, theme tokens, and scoped styles without deep selectors whenever possible.
- Keep code organized according to `docs/ARCHITECTURE.md`: preserve the Electron security boundary and keep capture-domain logic in Rust.
- Keep changes consistent with `docs/CODE_QUALITY.md`: no source file over 500 lines, types in dedicated type files, readable small units, and tests for TypeScript and Rust changes.

## Verification

Before handing off a change, run the smallest relevant checks and report any unavailable platform-specific checks. For frontend changes, run the TypeScript build and Vitest. For Rust changes, run formatting, tests, and Clippy when the toolchain is available.
