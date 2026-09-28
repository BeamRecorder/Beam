# Beam native launcher

The capture launcher is Solid TSX rendered by ARGUI. Shared controls live in
`src/solid/shared/base-ui`; capture views live in `src/solid/hud` and the
separate preferences window lives in `src/solid/shared/settings`. Rust services
and the in-process media engine are in `apps/beam-native`.

Initialize the pinned ARGUI submodule, then run
`node scripts/native-ui/build.mjs --stage` from the repository root. This applies the Beam ARGUI patch if needed,
builds the two UI bundles and Rust host, and stages the result under
`build/native/<os>/<arch>/native-ui`. For a direct development run, use
`bun run beam:native`. `bun run electron:dev` stages and launches the native
capture window while retaining Electron for completed projects.

The native host reads `Videos/Beam/user/preferences.json` and stores launcher
size and position alongside existing editor preferences. `BEAM_USER_DIR` can
point to an isolated `user` directory for development. `ARGUI_APP_BUNDLE` and
`ARGUI_APP_ASSETS` select staged UI files. On Linux, use an X11 session with a
compositor for the transparent region picker; the launcher reports unsupported
window capabilities when that overlay cannot be presented reliably.

Focused checks:

```sh
bun run --filter @beam/native-ui check
bun run --filter @beam/native-ui test
cargo nextest run --manifest-path apps/beam-native/Cargo.toml --test beam_preferences
```
