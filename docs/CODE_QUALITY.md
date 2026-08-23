# Code Quality Guidelines

The goal is maintainable, readable code with the smallest implementation that makes the behavior correct and testable.

## Size and structure

- No production source file may exceed 500 lines.
- Split large files by responsibility instead of merely moving blocks into arbitrary files.
- Prefer small pure functions with explicit inputs and outputs.
- Keep side effects at boundaries: IPC, filesystem, media, clocks, and native APIs.
- Avoid speculative abstractions, duplicate logic, hidden mutable state, and clever one-liners that obscure behavior.
- Use names that describe domain behavior. Comments should explain a constraint or decision, not restate the code.
- NO compatibility layers, no fallbacks, no stubs, no placeholders.

## TypeScript rules

- Use strict TypeScript settings and avoid `any` in new code.
- Put shared types in `src/types/` or a dedicated `{feature}-types.ts` file.
- Avoid files that mix a large type catalog with substantial implementations.
- Validate untrusted IPC, JSON, and filesystem data at the boundary before using it as a domain type.
- Keep renderer-facing API types aligned with preload methods.
- Prefer discriminated unions for protocol and state variants.
- Do not silently coerce missing data into fake defaults when that would change user-visible behavior.

## Rust rules

- Run `cargo fmt --all --check` and Clippy with warnings denied for Rust changes.
- Prefer domain-specific types over loosely structured maps when data crosses module boundaries.
- Keep platform-specific code behind focused modules and feature/cfg gates.
- Return actionable errors with context; do not discard capture, storage, or timing failures without recording their effect.
- Preserve schema compatibility intentionally. Add defaults or migrations when older session files must remain readable.
- Test recovery, partial writes, timing boundaries, optional-track failures, and serialization changes.

## Testing and coverage

Every behavior change must include or update tests at the closest useful layer.
Testing means covering every edge cases including "near impossible" cases.
You should write at least 3 tests per function you want, more if it's complex and can benefit edge cases.

### TypeScript

- Use Vitest for TypeScript and Vue logic.
- Test pure functions, composables, API adapters, and important component states.
- Include success, empty, invalid, loading, failure, and boundary-time cases.

### Rust

- Use Rust unit and integration tests for model, protocol, storage, clock, cursor, and session behavior.
- Keep hardware tests separate from deterministic tests and clearly report platform requirements.

### Minimum quality gate

The target and minimum coverage gate for tested TypeScript code is 90% for:

- statements;
- branches;
- functions;
- lines.

Do not lower the threshold to make a change pass. If a module is difficult to test, reduce side effects or split the module before adding exclusions. Generated files, build output, and hardware-only integration paths may be excluded only when the exclusion is explicit and justified in the test configuration.

## Required checks

Use the relevant commands before handoff:

```bash
bun run test
bunx vitest run --coverage
bun run build
cargo fmt --all --check
cargo test --workspace --all-features
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

Report commands that cannot run because of platform, toolchain, permissions, or hardware limitations.

## Review checklist

- Is the implementation smaller and clearer than the alternatives considered?
- Is the file under 500 lines and split at meaningful boundaries?
- Are types in the correct dedicated module?
- Are failure and missing-data states explicit?
- Are tests present for branches and edge cases?
- Does coverage remain at or above 90% across statements, branches, functions, and lines?
- Are TypeScript and Rust checks documented in the handoff?
