# Programmable native editor

Beam's UI, TypeScript SDK, CLI and MCP tools use the same Rust `EditorService` and
transaction engine. The platform-neutral `beam-editor-domain` crate contains the
project model, typed operations, validation, history, curves, extension definitions
and paged projections. It has no GStreamer, ARGUI, QuickJS or MCP dependency.
`beam-editor-engine` supplies the media actor, exports, grants and local owner.

## Contracts and versions

Rust's `protocol::Request`, `Response` and command types are the authority. Schemars
0.8.22 emits an explicit draft-07 schema. `scripts/editor/generate-contracts.mjs`
creates the SDK's JSON Schema and TypeScript contracts and the identical local UI
contract. The generator preserves fixed Rust arrays as TypeScript tuples and
rejects non-local schema references. Business types are never maintained separately
in a client. Enum fields have explicit Serde names because Schemars 0.8 does not
apply Serde's `rename_all_fields` attribute.

```sh
node scripts/editor/generate-contracts.mjs
node scripts/editor/generate-contracts.mjs --check
```

API version 1, document schema version 2 and individual definition versions are
independent. Clients negotiate actual processors and hardware export formats via
`discovery`. Missing media backends return errors; exports retain Beam's explicit
hardware encoder policy.

## Start a headless owner

```sh
cargo build -p beam-editor-cli -p beam-editor-mcp
beam-editor serve --project-root /private/beam/project \
  --source /authorized/recording.webm \
  --destination-root /authorized/exports
```

`serve` prints one JSON readiness record containing `endpoint`, `tokenFile` and
opaque project/source/destination grants. Keep its stdin open for the owner's
lifetime; closing stdin shuts it down. The trusted CLI authorizes each explicitly
named source file and destination directory. Requests contain grant IDs, never
unrestricted source paths. Destination filenames must be single relative names;
existing destinations are rejected. Revoked, missing and wrong-kind grants fail.
The `grants` query lists granted IDs, kinds and display names without paths.

The default Unix address is a SHA-256 of the canonical project directory in
`/tmp/beam-editor-<effective-user-id>`, whose owner and permissions must be 0700.
Project path length does not affect socket length, and symlink aliases share the
same address. Socket and token files require the same owner and permissions 0600;
symlinks and unsafe permissions fail explicitly. A persistent 0600 lock inode is
held exclusively until the broker finishes shutting down. After an abrupt process
exit, the next owner verifies and removes its abandoned socket and token, then
creates a new session token. It never removes a live listener or a non-private
file. An explicit trusted CLI endpoint
requires a private parent directory. Unix uses a private socket and token file. Windows uses a named pipe and a separate
private token file whose location is returned in readiness. The SDK takes those
exact values, rather than deriving a platform-specific token location. There is
no TCP listener. An exclusive project lock prevents competing owners; native
UI clients attach to the same service and broker.

## A readable SDK transaction

```ts
import {
  EditorClient, curve, keyframe, number, seconds,
} from './packages/editor-sdk/src/index.ts';

const editor = await EditorClient.connect(ready.endpoint, ready.tokenFile);
const project = await editor.open(ready.grants.project);
const tracks = await editor.query({
  kind: 'tracks', sequenceId: project.info.activeSequence, offset: 0, limit: 256,
});

await project.batch((batch) => {
  const clip = batch.insert(assetId, tracks.page.items[0]!.id, 0, 1000);
  const camera = batch.effect(clip, 'beam.transform', { scaleX: number(1) });
  batch.parameter(clip, camera, 'rotation', curve('clipLocal', [
    keyframe(seconds(0), { kind: 'number', value: 0 }),
    keyframe(seconds(1), { kind: 'number', value: 20 }),
  ]));
  for (let i = 0; i < 10; i++) batch.effect(clip, 'beam.color');
}, { idempotencyKey: 'insert-camera-1' });
```

`Batch` produces typed commands and references to earlier created results. `batch.result(commandId, index)`
addresses an individual result of a command that creates several IDs. Each
FX call creates a separate instance. The same helpers insert generators and real
two-input transitions, duplicate FX, paste clips across sequences, register
extension packs and create keyframes at a sequence time. The generic `operation`
and `edit` helpers expose every generated command without a parallel client model.

`milliseconds`, decimal `seconds` and rational `frames` reduce exact integer time.
`frames(30000, { numerator: 30000, denominator: 1001 })` is exactly 1001 seconds.
Curves carry source, clip-local or sequence time and constant, linear or Bézier
interpolation. `curve` sorts a copied array and rejects equal keyframe times.

`dryRun: true` calls validation without persisting. Transactions check the project,
sequence and expected revision, then validate and publish atomically. An invalid
command publishes none of the batch. Reusing an idempotency key with the same
transaction returns its durable receipt; conflicting reuse fails. Keep the original
transaction when retrying after a lost response. `EditorServiceError.detail`
contains stable codes and expected/actual conflict revisions. SDK session helpers
refresh revision context after a commit. Undo and redo are ordinary commands.

Track and sequence stacks use explicit `ScopedEffect` addresses and sequence time.
`batch.trackEffect(track, definitionId)` and `batch.sequenceEffect(sequenceId,
definitionId)` default to version 2 for the built-in color, transform, opacity and
gain processors. Version 1 remains immutable and applies to clips. Registered
definitions declare their supported targets; pass their actual version explicitly.
`batch.scoped(target, action)` exposes stack ordering, bypass, ranges, parameters
and keys through generated Rust types. Track pages contain `TrackOverview`
metadata and counts; `query({ kind: 'track', sequenceId, trackId })` retrieves one
validated stack with its revision. The equivalent `sequence` query returns
sequence metadata and its validated stack. `editor.parameters(target, time)`
returns evaluated values, the actual revision, target and exact requested time.
Its `ReadTarget` discriminates clip, track and sequence with actual UUIDs. Clip
values use their source/retiming clock; track and sequence values use absolute
sequence time. The existing clip `parameterValues` query remains available.

Timeline regions carry the same target address. Track and sequence ranges use
sequence time and intersect `[0, sequenceDuration)`; disabled instances retain
their regions with `enabled: false`. Empty sequences expose no such regions.

Queries return revisioned pages with a limit of 1–256 and a next offset. Page limits,
the 8 MiB message budget and 128 pending SDK calls are operational budgets, not
limits on document clips, tracks or FX instances. `events(afterRevision)` starts
polling only when iterated, accepts an abort signal and reports expired cursors as
errors requiring a state refresh. Export and preview calls pin a project, sequence,
revision and idempotency key. SDK session helpers carry this context. Jobs remain
addressable by ID after newer jobs start; `job(id)`, `cancelJob(id)` and
`waitForJob(id)` use the same durable record. Aborting an RPC does not undo a
published transaction or implicitly cancel an export job.
Job records carry a typed `scope`: sequence work names its actual `sequenceId`,
while source work names its `assetId`; source scope never fabricates a timeline.

Transactions and media imports share a durable journal of the latest 128 revisions.
Import events have an empty command-ID list and do not create transaction receipts.
Legacy documents recover only their contiguous receipt suffix; older cursors or
unrecorded changes require a fresh projection, and future cursors are rejected.

`project.import(sourceGrants, idempotencyKey)` carries explicit project, sequence
and revision context and returns an `ImportPublication` with its created asset and
clip UUIDs. Imports accept 1–32 sources, publish one undo step and one event, and
retain the latest 128 publications. The owner hashes every authorized source before
copying or probing; an identical retry returns its durable publication even after
newer edits or a restart. Keep the original request context and ordered source
identities. Grants may be renewed, and paths never enter the publication. Reusing
a key for a different import or an edit fails before publication. New assets remain
available after undo.

`project.importStart(sourceGrants, idempotencyKey)` sends a native asynchronous
import request and returns a durable sequence-scoped job with its source count.
Use `waitForJob` or job subscriptions for completion. Its JSON artifact contains
the canonical `ImportPublication`, available through the same bounded artifact
resources; refresh the session after publication. The synchronous `import`
request remains available during host migration.

`editor.clipHeaders(sequenceId, offset, limit)` returns revisioned `ClipOverview`
pages for timeline placement, labels and counts using only verified headers.
`query({ kind: 'clip', sequenceId, clipId })` retrieves one inspector payload by ID
and its actual document revision. The existing `clips` query returns full
decisions for clients that need their bindings.
The domain stores clips and tracks in shared pages of 128 decisions. History clones
retain the same pages and identity indexes; editing a parameter clones one clip and
its page's pointer list. Storage version 2 records separate content hashes for the
placement/instance headers and FX payloads. Opening reconstructs shared header
indexes across histories without loading parameters or curves. A query or render
loads its needed pages, verifies their digest and header agreement, then validates
the loaded decisions against the catalogue. Corrupt or unavailable pages return
contextual errors. Checkpoints reuse unchanged hashes and clear persisted dirty
flags. A changed page still serializes its 128 decisions; dense checkpoint I/O
therefore has a measurable cost. Each imported source carries its real SHA-256 and
byte length. Storage version 2 rejects missing source identities; legacy sources
receive verified identities through the native importer/open migration.
The owner adopts the document returned by each checkpoint, including history
retention. History is capped at 50 states and 256 MiB of unique historical decision
blocks and index metadata beyond current states; source media and telemetry are
outside this budget. A dense page can therefore reduce the retained undo depth.

`query({ kind: 'asset', id })` returns one source's metadata, identity and revision
without exposing its path or embedding telemetry. To restore or replace a source,
call `project.relink(assetId, sourceGrant, clipIds, idempotencyKey)`. The owner hashes
the authorized file before copying it and returns a durable receipt whose first
created ID identifies the new immutable source version. Explicit clips in one
sequence change their reference in a single undoable transaction. Old assets remain
available to histories and pinned jobs; source bytes are never replaced in place.
Linked clips must all be named. Identical source bytes preserve recording/cursor
metadata and shared telemetry. A new source without cursor metadata reports it as
absent, and incompatible media or shorter source bounds reject the publication.

`project.analyze(assetId, 'zoomClicksV1', idempotencyKey)` starts an immutable
source analysis job. It requires separated cursor telemetry and derives zoom
suggestions from recorded clicks. Ordinary videos and baked-in cursors fail
explicitly. Movement without clicks produces an empty analysis. Its JSON artifact
records the asset identity, accepted revision, telemetry SHA-256, algorithm and
all suggestions. Analysis does not rewrite the capture or existing decisions.

`project.proxy(assetId, { container, width, height, frameRate }, idempotencyKey)`
starts a hardware render of the full original source at explicit dimensions and
rational cadence. It excludes montage effects, trims, retiming and cursor overlays.
Still images and audio-only sources fail. Hardware limits produce explicit errors
instead of changing the requested canvas. Proxy bytes remain an opaque managed
artifact, readable through bounded resources. Both jobs use source scope and retain
their pinned source identities and durable replay through owner restarts.

## Versioned presets and extension packs

The paged `presets` query returns immutable templates with their ID, version,
definition ID/version and complete typed bindings. The built-in catalogue includes
warm color correction, fade in/out, centered framing and voice gain. Apply a preset
to an explicit effect, generator or transition UUID:

```ts
await project.batch((batch) => {
  batch.applyPreset({ kind: 'effect', clipId, instanceId }, 'beam.opacity.fadeIn', 1);
});
```

Application preserves the target's ID, ordering, name, enabled state and range.
Animated template keys receive fresh IDs. A missing target, incompatible definition
version or invalid binding rejects the transaction. Labels never identify or merge
occurrences. Undo/redo uses the ordinary decision history.

Extension packs carry a namespace, immutable version, required SHA-256, definitions
and presets. Obtain the digest from the same Rust authority with
`editor.sealPack(draft)`, or `beam-editor seal-pack --endpoint ... --file draft.json`,
then register the returned pack in a transaction. Canonical hashes sort catalogue
versions while preserving parameter/keyframe order; clients do not recreate this
algorithm or silently correct supplied digests. Namespaces and catalogue versions
have one owner, and provenance survives checkpoints and reopening.

## CLI and MCP use the same requests

```sh
beam-editor discover --endpoint /private/beam/owner.socket
beam-editor open --endpoint /private/beam/owner.socket --grant PROJECT_GRANT
beam-editor import --endpoint /private/beam/owner.socket --context context.json \
  --grant SOURCE_GRANT
beam-editor import-start --endpoint /private/beam/owner.socket --context context.json \
  --grant SOURCE_GRANT
beam-editor clip-headers --endpoint /private/beam/owner.socket --sequence-id <sequence-uuid>
beam-editor parameters --endpoint /private/beam/owner.socket --target read-target.json \
  --time exact-time.json
beam-editor asset --endpoint /private/beam/owner.socket --id <asset-uuid>
beam-editor relink --endpoint /private/beam/owner.socket --context context.json \
  --asset-id <previous-asset-uuid> --grant SOURCE_GRANT --clips clip-ids.json
beam-editor analyze --endpoint /private/beam/owner.socket --context source-context.json \
  --algorithm zoomClicksV1
beam-editor proxy --endpoint /private/beam/owner.socket --context source-context.json \
  --settings proxy-settings.json
beam-editor transact --endpoint /private/beam/owner.socket --file transaction.json
beam-editor validate --endpoint /private/beam/owner.socket --file transaction.json
beam-editor presets --endpoint /private/beam/owner.socket --offset 0 --limit 256
beam-editor preset --endpoint /private/beam/owner.socket --context context.json \
  --target target.json --id beam.opacity.fadeIn --version 1
beam-editor call --endpoint /private/beam/owner.socket --file -
beam-editor status --endpoint /private/beam/owner.socket --id <job-uuid>
beam-editor cancel --endpoint /private/beam/owner.socket --id <job-uuid>
beam-editor garbage-collect --endpoint /private/beam/owner.socket \
  --project-id <project-uuid> --revision <expected-revision>
beam-editor-mcp --endpoint /private/beam/owner.socket
```

The CLI emits JSON, with exit code 0 for success, 1 for a service error response and
2 for CLI/transport errors. Structured files use the generated schema; CLI commands
never rewrite `editor.beam.json`. `beam-editor mcp --endpoint ...` and `--stdio`
start the same MCP adapter as the dedicated executable.

`editor.garbageCollect(projectId, expectedRevision)` and the corresponding CLI/MCP
request run maintenance in the current owner. The native service checks project
scope and revision and retains blocks referenced by histories and pinned jobs.
The response reports retained/removed block counts and freed bytes.

MCP tools are generated from Rust request variants (`beam_query`,
`beam_transaction`, `beam_validate_transaction`, `beam_export`,
`beam_job_get`, `beam_job_cancel`, etc.). Their schemas share the same
local definitions. Tool responses include validated structured content and a text
representation; domain failures use `isError`. Resources expose current project
metadata and the first pages of definitions, jobs and artifacts through opaque
owner-local `beam://` URIs. URI templates address `beam://jobs/{id}` and
`beam://artifacts/{id}?offset=0&length=262144`. Artifact bytes use bounded
`resources/read` chunks and are excluded from ordinary tool payloads. The SDK
maps `artifact(id, offset, length)` to the resource operation when using MCP.
Larger catalogues use paged `beam_query`.

The adapter explicitly supports MCP 2026-07-28 and 2025-11-25. Current clients use
`server/discover`, include version and client-capability metadata on each request,
and receive `resultType` and server identity. Initialization-based clients complete
`initialize` and `notifications/initialized` for 2025-11-25. Unknown versions and
missing metadata fail explicitly. These distinct lifecycles follow the official
[versioning contract](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
and [2025 initialization lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle).

Current `subscriptions/listen` acknowledges requested supported resource URIs,
checks only those resources and sends correlated update notifications. Cancellation
stops the watch. Legacy resource subscriptions and the optional Tasks extension
are not advertised. Export jobs remain accessible through the ordinary generated
status/cancel tools. The stdio implementation keeps reading while calls execute,
limits concurrent work, and suppresses replies for cancelled calls. It uses the
specified [newline framing and cancellation](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio)
and [subscription pattern](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions).

The SDK also provides `McpConnection.connect({ binary, args })`, which negotiates
MCP and maps typed requests to generated tools. An explicit `protocolVersion`
selects the 2025 lifecycle; the default is 2026. No dialogues or UI are required.

## Executable scenario and platform evidence

`scripts/editor/scenario.ts` runs one scenario through any of the three transports:
create → import → split → animated zoom/rotation → ten repeated FX → custom effect,
transition and generator definitions → sealed pack and versioned preset application →
real crossfade and annotation → undo/redo →
owner shutdown and restart → reopening from disk → seek → hardware export.
Import and relink retries compare their durable publications before and after
owner restart, with no duplicate assets, clips or revision increments.
It compares edit decisions after reopening,
checks the original source's streamed SHA-256 and verifies a nonempty real export.
`ffprobe` verifies that its video dimensions match the requested canvas.
The 64×64 attempt must either render that exact canvas or return a failed job with
the hardware encoder's explicit 128×96 minimum diagnostic. A separate canvas edit
then requests 128×96 and verifies that exact export size. Both outcomes are reported;
the scenario never accepts a silently resized output. It also compares artifact
resource bytes with the real exported file, restarts the owner again and verifies
that the completed pinned job and artifact remain readable.
The same scenario requests an exact 128×96, 30 fps source proxy, verifies its
resource SHA-256 and restart/replay, and confirms that source jobs leave the
montage intact. Its ordinary source has no cursor telemetry, so click analysis
must produce a failed job. Positive click analysis has a separate native
integration test with controlled telemetry and verified real source bytes.

```sh
bun scripts/editor/scenario.ts sdk /path/to/beam-editor source.webm /tmp/beam-sdk
bun scripts/editor/scenario.ts cli /path/to/beam-editor source.webm /tmp/beam-cli
bun scripts/editor/scenario.ts mcp /path/to/beam-editor source.webm /tmp/beam-mcp
```

Use at least 2.4 seconds of real video. The script reports a failure when a hardware
export backend is absent; passing the editing part does not prove export. It never
substitutes a software encoder or fabricated artifact. The module registration in
this scenario is an executable example of adding an effect, transition and generated
annotation using typed definitions without patching client views or command/history
code. The media backend implements their declared processor families.

The deterministic Rust protocol/CLI/MCP tests and SDK tests are headless. SDK tests
exercise actual temporary local streams and stdio framing, including malformed
responses, cancellation, conflicts and queue/message budgets. They do not validate
Windows/macOS media, drivers, named-pipe security or native desktop rendering.
Those platform gates require execution on the corresponding OS. The workspace-wide
85% Rust coverage gate is separate from focused tests and must include each crate.
