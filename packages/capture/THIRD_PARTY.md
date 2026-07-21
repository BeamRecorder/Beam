# Third-party software

Versions are locked in `Cargo.lock`; licenses below describe direct dependencies.

| Dependency | Purpose | License |
| --- | --- | --- |
| serde / serde_json | Stable JSON schemas and JSONL | MIT OR Apache-2.0 |
| thiserror | Typed errors | MIT OR Apache-2.0 |
| uuid | UUID v7 identifiers | MIT OR Apache-2.0 |
| crossbeam-channel | Bounded queues | MIT OR Apache-2.0 |
| hound | Float PCM WAV writing | Apache-2.0 |
| png / sha2 | Cursor shape storage/deduplication | MIT OR Apache-2.0 |
| windows-capture / windows | Windows capture APIs | MIT or MIT OR Apache-2.0 |
| screencapturekit | macOS ScreenCaptureKit bindings | MIT OR Apache-2.0 |
| core-graphics / objc2-av-foundation | macOS cursor events and permission state | MIT OR Apache-2.0 |
| fs2 | Free-space validation | MIT OR Apache-2.0 |
| pipewire / ashpd / x11rb | Linux capture, portal and X11 | MIT-compatible ecosystem licenses |
| tracing | Structured diagnostics | MIT |

Transitive licenses must be reviewed from `Cargo.lock` before release distribution.
