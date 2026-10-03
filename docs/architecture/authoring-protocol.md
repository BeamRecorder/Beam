# Shared document authoring

Authoring belongs to `@beam/engine`. Desktop, CLI, scripts and future agent/collaboration transports call the same commands and validators. Engine imports no Vue, Electron, Node, filesystem or rendering backend. Vue supplies reactive bindings and user interaction; hosts supply files, fonts, media and transport.

## Direct engine API

```ts
import {
  createRenderDocument,
  createStillDocument,
  createAuthoringSession,
  createDocumentEndpoint,
} from '@beam/engine';

const video = createAuthoringSession(createRenderDocument(undefined, 1920, 1080, 30));
video.execute({ type: 'render.patch', payload: { blurPercent: 20 } });

const image = createAuthoringSession(createStillDocument('image-id', 'assets/source.png', 1280, 720));
image.transaction([
  { type: 'still.layer.patch', payload: { layerId: 'image', patch: { isMirrored: true } } },
  { type: 'still.settings.patch', payload: { format: 'webp', quality: 0.9 } },
]);

const endpoint = createDocumentEndpoint('video-id', video);
const unsubscribe = endpoint.subscribe(event => transport.send(event));
const response = await endpoint.receive(incomingJson);
transport.send(response);
reportObserverErrors(endpoint.takeObserverErrors());
unsubscribe();
```

`transport`, incoming data and diagnostic reporting above belong to the host. An in-process caller can use `execute`, `transaction`, `undo` and `redo` directly, without JSON transport. `subscribe` and `document` support a Vue `shallowRef` binding. The desktop's composition commands and still-layer helpers are the same engine operations; UI selection, gestures, dialogs and presentation adapters remain desktop responsibilities.

The initial document is copied once and recursively frozen. Commands retain unchanged records by identity. A successful nonempty batch validates the resulting document and publishes one revision/undo step; a failure preserves the current document and history. Undo/redo restore owned snapshots and increment the revision. Empty batches do not increment it. History retains at most 50 states. JSON serialization and host persistence are explicit copying boundaries.

## Commands and extensions

`createRenderCommands()` wraps `createCompositionCommands()` and adds `render.patch`. The registry includes asset/clip creation, appearance patches, move, split, trim, rate, volume, reorder, visibility, delete, detach, scene groups and generic animation tracks. `asset.add` requires complete metadata; `clip.add` requires a complete valid clip record. No host-specific file discovery runs inside a command.

`createStillCommands()` provides:

- `still.layer.add`: add an image, shape/text/drawing, blur effect or static cursor.
- `still.layer.patch`, `.delete`, `.enable`, `.reorder`: edit content and ordered layers.
- `still.layer.compositing`: opacity, blend mode and explicit locking/unlocking.
- `still.canvas.set`, `still.background.set`, `still.settings.patch`: canvas, background, blur and PNG/WebP settings.

Stills share visual clip geometry, appearance and GPU effect rendering with video. They have no playback/keyframes; animated still content is rejected. Special background/image/watermark layers can be hidden and restored; deleting the captured image does not erase its source. Locked content cannot be patched, reordered or deleted without explicitly unlocking it.

Trusted extensions can register `{type, parse, apply}` with a registry and pass it to `createDocumentSession`. `parse` validates unknown payloads; `apply` returns an immutable new document. The final document validator remains mandatory. Serialized documents/commands contain plain JSON, never functions or framework objects. New media backends implement runtime frame/resource interfaces rather than importing desktop code into engine.

## Identified transactions

`createDocumentEndpoint` accepts version 1 requests. A transaction request contains a transport request ID and an independently identified operation:

```json
{
  "version": 1,
  "id": "request-42",
  "method": "transaction",
  "transaction": {
    "version": 1,
    "documentId": "video-id",
    "operationId": "operation-42",
    "actorId": "agent-7",
    "expectedRevision": 0,
    "commands": [
      { "type": "render.patch", "payload": { "blurPercent": 20 } }
    ]
  }
}
```

The response is `{version:1,id,ok:true,result}` or `{version:1,id,ok:false,error:{code,message}}`. Transaction results/events contain document, actor and operation IDs, previous/current revisions and immutable commands. A `snapshot` request returns `{documentId,revision,document}`. `undo` and `redo` take `expectedRevision` and publish the restored document:

```json
{"version":1,"id":"snapshot-1","method":"snapshot"}
{"version":1,"id":"undo-1","method":"undo","expectedRevision":1}
```

Each endpoint serializes incoming requests, including asynchronous history restoration. `expectedRevision` mismatches return `revision-conflict`; invalid envelopes, reused IDs with different data and failed commands return `invalid-request`. Clients must obtain the current state and reconcile a conflict rather than silently overwrite it.

Retrying the exact same transaction, including its original revision, returns the original event without another edit/broadcast. The last 512 successful operations are retained; history retries have a separate 512-request bound. Beyond that window, replay is subject to ordinary revision validation. Each transaction has at most 1,000 commands. These are ordered transactions, not a CRDT or a Yjs adapter; actor IDs identify authors without resolving concurrent edits.

Subscriber exceptions do not roll back an already committed edit or turn its retry into a second edit. Reentrant edits/history requests during publication are rejected so observers see one stable revision. Diagnostics are bounded to the latest 64 observer failures per collection and drained through `takeObserverErrors()`. Hosts must report them. Portable JSON validation rejects nonfinite numbers, functions, cycles, custom prototypes, accessors, symbols, sparse arrays and unsafe object keys. Default limits are five million nodes and depth 64; deeply frozen validated subtrees are cached while preserving those limits.

## CLI as a host

Installed Beam includes `beam-cli`; Windows uses `beam-cli.cmd`. Linux also supports `beam --cli …`, dispatched before the desktop starts. macOS installs its launcher in `Beam.app/Contents/MacOS/beam-cli`. Add that directory to PATH or invoke the full path. Development uses `bun run beam …`.

```sh
beam-cli commands
beam-cli create video video.json
beam-cli create image source.png 1280 720 image.json
beam-cli edit video.json commands.json edited.json
beam-cli serve edited.json
beam-cli export edited.json video.webm
beam-cli frame edited.json 500 frame.png
beam-cli record capture-config.json 10
beam-cli screenshot capture-config.json screenshot.png
```

`edit` takes a JSON array of `{type,payload}` commands. `serve` reads one request per stdin line, writes responses and `{version:1,event}` notifications on stdout, and reports observer errors on stderr. It owns an in-memory session; persistence belongs to the caller. Obtain a snapshot and save it explicitly. Session/retry history does not survive restarting this process.

Video documents created by the CLI wrap a render snapshot with project name, format, preset and document ID. Existing project/composition JSON is also accepted for inspection/editing; a complete render snapshot is required for export. Image documents store `kind:"image"`, version, ID, source dimensions and editable state. `frame` returns a PNG and its editable still document on stdout; use that document with the image commands and export.

Relative media/font paths resolve beside the input JSON. HTTP and file URLs are supported; desktop `project-media:` and transient `blob:` resources require host resolution. `--overwrite` is explicit. Node storage adapters stage and publish complete outputs atomically per file; they do not promise atomicity across multiple files. Engine only receives data/capability interfaces and never reads these paths itself.

## HTML, Vue and GSAP motion

A motion job points to a user-owned HTML entry:

```json
{"version":1,"entry":"index.html","width":1280,"height":720,"duration":3,"fps":30,"format":"webm","preset":"high"}
```

```sh
beam-cli motion job.json motion.webm
```

The HTML project may import Vue SFCs and its own installed dependencies. It must expose deterministic seeking in milliseconds:

```ts
const timeline = gsap.timeline({ paused: true });
// Author animation on timeline, starting at zero.
window.beamComposition = {
  async seek(timeMs) {
    timeline.seek(timeMs / 1000, false);
    await nextTick(); // Vue must finish any reactive changes before capture.
  },
};
```

An optional `ready` promise gates initialization. Seeking must also work backwards and repeatedly without wall-clock state. The host waits for fonts/images, captures transparent frames at source time, and supplies owned bitmap leases to the shared renderer and encoder. An optional render snapshot combines the generated clip with existing scenes/effects. GSAP belongs to the authored project, not engine. The compiler is lazily loaded only for motion; normal inspection/editing needs no browser/compiler. Desktop programmable-asset resolution is a separate integration from this CLI authoring host.

## Backends and verification limits

Headless means no interface window; it does not make GPU/codecs available in plain Node. Export/frame/motion use an explicit Chromium backend. Run `beam-cli browser install`, configure `BEAM_CHROMIUM_EXECUTABLE`, or provide a compatible cached browser. Default software WebGL provides a reproducible backend and uses CPU; set `BEAM_CHROMIUM_GPU=hardware` only with an available headless hardware stack. Existing Canvas2D composition/text and GPU effects keep their common preview/export paths.

Linux displayless export, Vue/GSAP frames, video-frame/image editing and the actual timeline surface have been exercised in Chromium. Launcher layout/native executable discovery have focused Linux/Windows/macOS tests; native Windows/macOS execution and hardware capture still require their target OS, permissions and sources. Native capture remains in Rust. No global application performance gain or complete collaborative editing implementation is implied by the package split.
