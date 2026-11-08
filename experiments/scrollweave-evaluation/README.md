# ScrollWeave candidate evaluation

Decision: do not connect ScrollWeave directly to Beam's live scrolling capture yet.
This is an isolated experiment, not a shipped Screenshot mode. Beam's production
Cargo workspace, capture protocol, windows and dependencies are unchanged.

## Candidate and scope

- ScrollWeave 0.9.5, pinned to `81b5a49b4cedb2a0c65c4ec74155fc0c259a69d5`.
- MIT-licensed, standard-library-only Rust core. No Python runtime is needed.
- This package deliberately has its own Cargo workspace and lockfile.
- Eight deterministic Rust tests cover original pixels, alignment, explicit
  header/footer bounds, malformed geometry, blank images and periodic content.
- Three runner tests independently check pixel equality, dimension mismatch and
  single-pixel errors.
- Four local HTML scenarios are captured by real Chromium, with three viewport
  screenshots per scenario. No external sites or private recordings are used.
- Independent full-content screenshots provide the pixel/dimension reference.
  The browser's actual scroll positions and content rectangle are recorded only
  as test ground truth; Beam cannot infer these from mouse-wheel deltas.

## Measured results — 2026-11-07

Host: Linux x86_64; Rust 1.98.0; installed Chromium; device scale factor 1.
The native Windows/macOS capture backends were not exercised. These are matching
and reconstruction measurements, not a capture or preview-frame-rate benchmark.
Full raw output is in [measured-results.json](measured-results.json).

| Scenario | Automatic output | Reference | Observed result |
| --- | --- | --- | --- |
| Plain document | 640 × 840 | 640 × 840 | Exact positions and 100% identical pixels; geometry-edge warning |
| Fixed header, footer and sidebar | 560 × 672 | 560 × 672 | Exact positions and 100% identical pixels; geometry-edge warning |
| Nested application pane | 382 × 612 | 384 × 613 | Positions correct, but automatic content bounds remove two columns and one row |
| Repeated rows | 640 × 239 | 640 × 880 | Positions incorrectly estimated as `[0, 0, 0]`; no warning |

Two controls distinguish the failure sources:

- Known positions, automatic content bounds: plain and fixed-chrome cases are
  exact. Nested-pane and repeated-row content are still cropped incorrectly.
- Known positions **and** known content rectangle: all four cases reconstruct
  with exactly the reference dimensions and 100% identical pixels.

The blank/periodic Rust tests also demonstrate successful API returns with
incorrect zero offsets and no warnings. They characterize a limitation; passing
those tests does not mean the candidate detects ambiguous scrolling safely.

One serial process completed all 12 browser reconstructions in **10.50 seconds**,
with **26,724 KiB peak RSS** (GNU time). Automatic three-frame runs took
**0.73–1.17 seconds**. These small inputs do not establish large-page performance.
This was an optimized development build with one Cargo build job, not a full
Beam build or all-workspace test run.

The runner's `passed` flag is deliberately strict: no warnings, correct relative
positions, identical output dimensions and exact pixels. A correct image with a
geometry warning therefore remains unaccepted for unattended integration. The
runner reports all cases, including failures; successful process completion only
means the experiment itself completed.

## Why this is not ready for the live widget

1. The public API is batch based. `stitch_basic` estimates positions;
   `reconstruct_layered` requires them. There is no incremental capture session,
   cancellation or deadline API. Reprocessing every previous frame for each new
   preview would need a separate design.
2. A repeated or textureless view can match several scroll distances. Wheel input
   can help schedule capture and indicate direction, but does not provide the
   target application's exact pixel offset. Silent shortening is unacceptable.
3. Automatic content-region detection can discard source pixels. A user-selected
   content region should take precedence over automatic chrome removal.
4. Layered reconstruction retains output-sized coverage, confidence, provenance,
   source IDs and evidence buffers. Its own large limits are unsuitable as Beam's
   memory budget. This runner limits inputs to six frames of at most 1 MP,
   each PNG to 8 MB, and the expected/estimated output to 5 MP.

## Reproduce

From the repository root, use one build job:

```sh
cargo test --locked --jobs 1 --manifest-path experiments/scrollweave-evaluation/Cargo.toml -- --test-threads=1
cargo fmt --manifest-path experiments/scrollweave-evaluation/Cargo.toml -- --check
cargo clippy --locked --jobs 1 --manifest-path experiments/scrollweave-evaluation/Cargo.toml --all-targets -- -D warnings
```

Generate browser fixtures (requires Beam's Bun dependencies and installed CLI
Chromium):

```sh
bun experiments/scrollweave-evaluation/capture.ts
```

The command prints the manifest path in an OS temporary directory. Pass that
path and a separate results directory to the runner:

```sh
cargo run --locked --jobs 1 --manifest-path experiments/scrollweave-evaluation/Cargo.toml -- MANIFEST.json RESULTS_DIRECTORY
```

The runner saves each reconstruction PNG and `measurements.json`. Timing covers
matching/reconstruction only; the recorded process RSS also includes input
images, PNG decoding and serialization. Browser capture and compilation are
outside that timed process.

The manual [ScrollWeave evaluation workflow](../../.github/workflows/scrollweave-evaluation.yml)
runs the same isolated Rust tests, formatting and Clippy on Linux, Windows and
macOS. All three jobs passed their 11 Rust tests, formatting and Clippy in
[run 42534473338](https://github.com/BeamRecorder/Beam/actions/runs/42534473338)
on commit `988fc6295facfbfb7ce853ab421d5a1c821c6c76`. Native capture must still
be validated on each platform; portable image tests cannot prove that behavior.

## Beam integration findings

- Keep capture ownership in Rust and use a dedicated start/status/finish/cancel
  session. Retain only bounded incoming frames and thumbnails; write the final
  PNG once. Do not loop over the one-shot screenshot command.
- Linux already supports an encoder-free `ScreenConsumer::Samples` stream. Keep
  one Portal authorization and PipeWire session instead of re-prompting.
- Windows and macOS recording adapters currently reject `Samples`. Their WGC
  screenshot callback and SCK stream adapters need a real continuous-frame path
  before a live scrolling mode can be considered cross-platform.
- The preview must stay outside the captured region unless native exclusion is
  actually supported and tested. Linux monitor capture cannot generically hide
  an arbitrary overlay from the resulting pixels. Do not hide/show it per frame.
- Respect Screenshot's existing 16,384 px per-axis and 67,108,864 total-pixel
  limits, or design tiled editing/export separately before exceeding them.

A production acceptance gate must include safe ambiguity rejection, no duplicate
or missing rows, repeated/backward/no-overlap input, bounded memory, cancellation,
widget exclusion, and a final PNG that opens in the existing Screenshot editor.

## Sources

- [Pinned Rust API](https://github.com/xtr-hub/scrollweave/blob/81b5a49b4cedb2a0c65c4ec74155fc0c259a69d5/src/lib.rs)
- [Pinned automatic matcher](https://github.com/xtr-hub/scrollweave/blob/81b5a49b4cedb2a0c65c4ec74155fc0c259a69d5/src/stitch.rs)
- [Pinned layered reconstruction](https://github.com/xtr-hub/scrollweave/blob/81b5a49b4cedb2a0c65c4ec74155fc0c259a69d5/src/layered.rs)
- [Upstream validation limits](https://github.com/xtr-hub/scrollweave/blob/81b5a49b4cedb2a0c65c4ec74155fc0c259a69d5/docs/PORT_STATUS.md)
