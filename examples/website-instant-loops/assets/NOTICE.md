# Media sources

Original Beam composition `beautiful-captures.webp` reused from existing Beam website examples. The composition preview uses the real Beam gradient renderer and its Tide, Nocturne and Sunrise presets.

macOS arrow uses Beam's bundled cursor pack and native geometry/hotspot helpers; source pack credits are maintained with the desktop cursor assets.

Hanken Grotesk is redistributed under SIL OFL (included). Lucide icons use ISC.

The UI consists of original Vue components imported directly from Beam (MPL-2.0): CaptureModeGroup, CapturePresetSelect, RecorderBar, QuickSnipStatus and Beamy. The in-memory example host drives fixture data, never Electron IPC or real recordings. Export progress is illustrated, not a performance benchmark. Beamy's native motion sampler uses the deterministic video clock.
