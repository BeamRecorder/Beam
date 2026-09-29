# Editor engine decisions, 29 September 2026

The baseline is Beam `aad72a13577d4d636db08c1adcb22ad612a4e3bc` and Argui
`e7da47c18ffb555a83934712af64d1879b5ed276`. Validation uses Linux headless
media pipelines and native scene mounting. Windows/macOS remain separate gates.

1. **Domain boundary.** `beam-editor-domain` owns document validation, timeline
   operations, persistence, rational timing, parameter curves, definitions and
   transaction preparation. It has no GStreamer, platform capture, UI, JS or MCP
   dependency. `beam-editor-engine` owns probing, decoding and rendering.
2. **Time.** Public curves carry exact integer ticks and a timescale. Integer
   values stay within JavaScript's exact range. Frame cadence is numerator over
   denominator. Backend conversion rounds once. Ranges are half-open. Clip-local
   curves retain their original origin through trims and cuts; source and sequence
   curves use one mapping function.
3. **Transitions.** A transition relates two adjacent logical clips on one lane.
   The renderer extends outgoing/incoming source windows around their cut, and
   composes both during the overlap. Insufficient handles reject the transaction;
   they are never synthesized. Simple fades remain separate decisions.
4. **Effects.** Each occurrence owns a UUID and bindings. Array position is render
   order. Numeric, point, color and discrete values share one evaluator. A backend
   implements processing families; definitions expose inspector metadata and
   bind specialized processing. Shader source is bounded and validated before use.
5. **Transactions.** Commands prepare a candidate without mutating accepted state.
   A batch has one revision and undo step. References resolve only to earlier
   results. Durable receipts detect changed retries. The project owner publishes
   prepared rendering and disk state together. Failed preparation preserves the
   previous image and document.
6. **Growth.** No count ceiling for clips, tracks, sources or effect instances.
   Message, history, cache and queue budgets remain explicit. Clip validation sorts
   per-track intervals instead of comparing every pair. Storage uses content-addressed
   decision blocks; source metadata and telemetry are separate from undo decisions.
7. **Contracts.** Rust serde types with JSON Schema are authoritative. SDK types
   are generated from those schemas. CLI/MCP delegate to the same owner service.
   MCP's supported protocol revision is pinned by its implementation and tests.

These decisions describe contracts. The execution table in `native-editor-plan.md`
records actual gates; an unvalidated requirement is not marked complete.
