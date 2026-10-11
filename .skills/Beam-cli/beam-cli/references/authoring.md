# Live document authoring

Discover payloads with `beam-cli tools describe NAME`; use `beam-cli docs commands` for engine command details. Do not guess a command from its UI label. `beam-cli commands` lists the actual still/video registries.

1. `projects.list` identifies saved projects and open editors.
2. `projects.open` takes `projectId` and `kind: "image" | "video"`. New-window is the default; `disposition: "reuse"` deliberately replaces an active editor. Wait until `projects.list` reports the target open.
3. `documents.snapshot` returns the active document and revision. Read it before constructing an edit.
4. `documents.transact` applies a validated command batch atomically and creates one undo step. Use the snapshot revision as `expectedRevision` and a unique `operationId`.

Example transaction shape; substitute IDs and revision from the real snapshot:

```json
{
  "projectId": "PROJECT_UUID",
  "expectedRevision": 3,
  "operationId": "rename-intro-unique-id",
  "commands": [
    {"type":"clip.patch","payload":{"clipId":"CLIP_ID","patch":{"name":"Intro"}}}
  ]
}
```

```sh
beam-cli tools call documents.transact @transaction.json
```

Reuse an operation ID only for an identical retry. After a revision conflict, read a fresh snapshot, recompute the edit and use a new operation ID. Do not retry unchanged stale payloads in a loop. Busy gestures and inline editing can reject external changes; let the user's interaction finish. Locked content must remain protected.

`documents.undo` and `documents.redo` take the current revision and a unique `requestId`. An identical retry may reuse that ID. These operations use the real editor's history, not a separate agent history.

Native dimensions and transforms are different units: source/canvas dimensions are pixels, many clip transforms are normalized, and timeline clocks use milliseconds. Check the exact field before converting. Still compositing opacity is 0–100; scene-group opacity is 0–1.

Prefer `@FILE` JSON arguments to nested shell quoting. Paths in a tool argument file resolve relative to that file. Standalone media paths resolve beside the input document/job. Do not treat `project-media:` or `blob:` URLs as portable standalone files.

Do not edit saved project JSON while a live editor owns it. Use the live tools, or make a separate standalone output with `edit INPUT COMMANDS OUTPUT`. Existing output files are protected unless `--overwrite` is explicitly appropriate to the user's request.

Before claiming completion, reread the document and inspect a rendered result. Report project/output paths and any operations that could not run.
