# Beam agent CLI

The CLI exposes discoverable tools with JSON Schema inputs. It controls the documents
actually open in Beam; edits update the preview and use the editor's undo history.
Standalone `edit` and `serve` continue to work without the desktop application.

For reusable HTML/GSAP sentences, prompt fields, macOS cursors and camera moves,
see the [launch-video templates](../agents/templates/readme.md) and their complete
12-second example. Each component is customizable and deterministic when seeking.

Use `bun run beam` in a checkout, or `beam-cli` with the installed application. Below,
`beam` denotes either launcher.

```sh
beam tools list
beam tools describe html.publish
beam docs html
beam docs gradients
beam docs commands
beam instances
beam tools call projects.list
```

`tools list`, `tools describe`, and `docs` work offline. `docs` returns bundled Markdown,
its local location and the corresponding GitHub path. In a checkout, unpublished docs
are available locally before their GitHub links are available on the default branch.

Tool calls accept inline JSON, `@arguments.json`, or `-` for JSON on stdin. Paths in an
argument file resolve relative to that file; inline/stdin paths resolve from the working
directory. Results are JSON on stdout. Errors use stderr and a nonzero exit status.
With several Beam instances, append `--instance PID` from `beam instances`. Discovery
does not print authentication tokens.

## Connect to an editor

```sh
beam tools call projects.create '{"kind":"video","name":"Beam promo"}'
beam tools call projects.open '{"projectId":"PROJECT_UUID","kind":"video"}'
beam tools call projects.list
beam tools call documents.snapshot '{"projectId":"PROJECT_UUID"}'
```

For a Screenshot canvas, create with `kind: "image", width: 1920, height: 1080`.
Wait for the project to appear in `projects.list.open` before sending document commands.
Only ready editor documents accept edits. Closed projects must be opened first.

`projects.open` opens an independent editor window by default, for both video and
Screenshot projects. Your existing editors keep their projects. This behavior is
the same in development and installed releases; no second application process is
needed. To replace the active editor instead, explicitly request `disposition: "reuse"`:

```sh
beam tools call projects.open '{"projectId":"PROJECT_UUID","kind":"video","disposition":"reuse"}'
```

Check `projects.list.open` before opening a project again when updating an existing
CLI workflow. A canceled opening returns `status: "cancelled"`; it does not close
previously opened editors.

## Modify the document

Read a snapshot before each edit. Supply its revision, an operation ID and engine
commands. One transaction creates one undo step. UI edits also change the revision;
a concurrent edit fails explicitly instead of overwriting the user's work.

```json
{
  "projectId": "PROJECT_UUID",
  "expectedRevision": 3,
  "operationId": "agent-adjust-title-1",
  "commands": [
    {"type":"clip.patch","payload":{"clipId":"TITLE_ID","patch":{"name":"Intro"}}}
  ]
}
```

Call `documents.transact` with that file. Identical retries reuse `operationId`; never
reuse it with different arguments. Use `documents.undo` / `documents.redo` with the
current revision and a unique `requestId`. A busy gesture or inline edit rejects
external mutations; finish it and read a fresh snapshot before retrying.

`beam commands` lists engine command names; `beam docs commands` documents their
payloads, including captions, transforms, scene groups, animation tracks and still
layers. Live video `render.patch` supports `canvas`, `background`, `blurPercent`,
`zooms`, `zoomMotionBlur` and `zoomAutoFollow`. Recorded cursor data, fonts, cursor-pack
selection and render metadata remain host-owned. Media backgrounds must first exist
in the Beam background library. The CLI does not replace native capture responsibilities.

`assets.import` copies a local media reference into the active project and returns an
asset. Insert it with document commands; importing alone does not add a timeline clip.
Screenshot imports accept images only.
`assets.resolve` maps a `project-media:` URL to its real local file, constrained to the
specified saved project. Use it to inspect screenshots or supply references to HTML;
the reference project does not need to be open.

## Editable native text and fonts

Keep text that the user needs to edit in native text layers, alongside HTML artwork.
Use `still.layer.add` with `kind: "shape", family: "text", preset: "text"` and an
`ElementText` value for screenshots; use `clip.insert` for video elements. Read the
command documentation for the complete clip defaults and required text style fields.

```sh
beam tools call fonts.list
beam tools call fonts.import '{"source":"./HankenGrotesk.ttf"}'
```

The imported font returns `family`, `id` and `url`. Set `text.style.fontFamily` to
`family` and `text.style.fontAssetId` to `id`. Fonts become available in the editor's
font menu, and snapshot/export resolves those exact font files. These two tools work
without opening a project. Font imports validate real font bytes and deduplicate
identical files; they accept TTF, OTF, WOFF and WOFF2 up to 64 MiB.

## Inspect and export

```sh
beam tools call render.frame '{"projectId":"PROJECT_UUID","timeMs":5000,"output":"frame.png"}'
beam tools call render.export '{"projectId":"PROJECT_UUID","output":"promo.mp4","format":"mp4"}'
```

Screenshot exports follow the document's PNG/WebP settings. Video exports use the
current full render snapshot, including HTML frame sources, captions and zooms.
These tools require the CLI Chromium backend (`beam browser install`, or
`BEAM_CHROMIUM_EXECUTABLE`). Existing output files require `overwrite: true`.
Keep Beam running until the export finishes, because it owns the HTML frame providers.

## Local protocol boundary

Beam publishes one authenticated loopback endpoint per desktop process. Its discovery
file lives in the OS application-data `Beam Agents` directory, with restricted file
permissions. RPC rejects browser-origin requests. An editor registration is tied to
its Electron window's actual project identity. Executable compositions run in isolated
sandboxed windows without a Beam preload, Node, permissions, external network access
or navigation. The CLI is a local authoring interface, not a collaborative network
server or an MCP stdio server.

## Screenshot 3D layers and groups

Screenshot composition records accept `rotation3d: { x, y, perspective }` through
`still.layer.compositing` with `{ layerId, patch: { rotation3d: ... } }`. X and Y
are degrees from -80 to 80; perspective is a document-pixel camera distance from
200 to 10000. The effective distance stays outside the layer's bounding sphere
when necessary to keep tilted corners in front of the camera. The same engine
projection drives preview, native text editing, thumbnails, hit testing and PNG.
These are Screenshot layer settings; Studio's timeline camera remains separate.

Discover engine commands with `beam commands`, and read their payloads with
`beam docs commands`. `still.selection.group` accepts `{ layerIds, groupId }`,
`still.selection.ungroup` accepts `{ layerIds }`, and `still.selection.transform`
accepts `{ layerIds, from, to }`. `still.selection.rotate` accepts
`{ layerIds, bounds, degrees }` to rotate drawable members around their shared
bounds by a degree delta; locked layers and blur regions reject rotation.
Bounds use normalized canvas coordinates. Groups
persist on composition records as `groupId`; grouping joins complete existing
groups and requires at least two unlocked elements. Background, watermark and
zoom controls cannot join a group. Resizing also scales native text and cursor
sizes within their supported limits. Removing a member clears orphan groups.
`still.selection.move-to-group` accepts `{ layerIds, groupId, frontIndex? }` to move explicit members into an existing group, or detach them with `groupId: null`. The optional front-to-back insertion index changes stacking in the same transaction. Source groups with a single remaining member dissolve automatically; locked groups reject the move. Composition supports expandable groups, dropping on their headers or between members, and moving members into the unindented root list.
In Composition, a child row selects only that member; Ctrl/Cmd-click toggles individual members. The group header selects the complete group. The top edge of a header and gaps between groups insert standalone layers with a full-width guide; the header center adds a member to the group.
On the canvas, the first raycast click on a grouped member selects its group. Clicking a member of that selected group selects only that member, while dragging preserves the active selection. Double or triple clicks open the clicked member's text editor or image crop.

In Screenshot, drag on empty canvas or the surrounding workspace with the left button or drag with the right
button to select a rectangle. Ctrl/Cmd+G groups the selection; Ctrl/Cmd+Shift+G
ungroups it. Shared bounds move and resize the whole selection. The Placement
inspector edits the selection's position, alignment, size and rotation together.
Movement uses
cached layer anchors and six-screen-pixel snapping; Alt bypasses snapping. Guide
labels show dimensions and nearest gaps in document pixels, independent of zoom.
