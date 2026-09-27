# Beam Native

This is the first Argui window for Beam's native rewrite. It is a small working
UI shell; recording remains in `packages/media-engine` and is not wired into
this window yet. The app uses Argui source from `vendor/argui`, so editing a
local Argui crate and building again picks up the change immediately.

## First checkout

From the Beam repository root:

```sh
git submodule update --init vendor/argui
bun run argui doctor
bun run argui check apps/beam-native
bun run argui dev apps/beam-native --target native
```

`node scripts/dev/argui.cjs` builds the CLI from the same Argui submodule. It
uses Beam's ignored `target/` directory for its build cache; no CLI binary is
committed. Run `bun run argui build apps/beam-native dev --target native`
to compile without opening a window.

## Fix Argui while developing Beam

Edit the crate under `vendor/argui/crates/`, then rerun the build command. The
app's `argui-runtime` dependency is a Cargo path dependency, and Argui's
internal crates resolve from that same checkout. Cargo recompiles changed
sources without a crates.io release. Changes to the CLI itself are picked up
by the next `bun run argui` invocation.

For shared fixes, first create a branch inside the submodule because a fresh
`git submodule update` checks out a detached commit:

```sh
git -C vendor/argui switch -c codex/beam-fix
# Edit and verify the Argui crates, then commit and push this Argui branch.
git add vendor/argui
# Commit Beam's updated submodule pointer separately.
```

Other developers can run `git submodule update --init vendor/argui` to use
that exact source revision. Keep the Beam app's Cargo lockfile committed so
its other dependencies stay reproducible.

The Beam media engine and Argui both use `wgpu 30.0.1`, allowing the future UI
host to pass device and queue handles directly. The recording integration is
described in `docs/native-media-argui-migration.md`.
