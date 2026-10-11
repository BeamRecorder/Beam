---
name: beam-assets
description: Import and resolve local media, fonts and frozen HTML references for Beam compositions and editors. Keep native text editable and make standalone render assets portable.
---

# Beam assets

Use actual user-supplied or appropriately sourced media. Inspect dimensions, duration, alpha and audio before framing or trimming. Keep original sources; create derived working files when needed.

## Project media

```sh
beam-cli tools describe assets.import
beam-cli tools describe assets.resolve
```

`assets.import` accepts `projectId`, a local `source` and `kind: "image" | "video" | "audio"`. It copies into the project and returns asset metadata; **it does not insert a layer/clip**. Image projects accept image imports. Use the real returned asset with commands described by `beam-cli docs commands`.

`assets.resolve` takes a saved project ID and its `project-media:` source and returns the real local file. The project need not be open. It cannot resolve an arbitrary file outside the owning project. Never guess private session paths from a UUID.

## Fonts and editable text

```sh
beam-cli tools call fonts.list
beam-cli tools call fonts.import '{"source":"./fonts/Brand.ttf"}'
```

Import supports TTF, OTF, WOFF and WOFF2. Native text must use returned `family` as `text.style.fontFamily` and returned `id` as `text.style.fontAssetId`; a matching display name alone does not guarantee export uses the same font.

HTML uses a local `@font-face` URL inside its source tree. Font import for native text does not implicitly expose that font file inside sandboxed HTML. Bundle the actual required faces/weights; await font readiness before inspecting layout.

## HTML references

Place references inside the source folder or supply `html.publish.references`:

```json
{
  "references": [
    {"name":"product.png","source":"./references/product.png"}
  ]
}
```

Publication copies/freeze references beside the saved source; authored HTML uses `./references/product.png`. Cross-project `project-media:` references also need the owning `projectId`. Keep names plain and paths local. Source trees reject symlinks and exclude `node_modules`; install project dependencies outside the copied source tree.

## Standalone portability

Use local paths relative to the input job/document, file URLs or supported HTTP sources. Desktop `project-media:` and transient `blob:` URLs are not portable standalone renderer inputs; resolve/copy them first. HTML source should carry its own local assets and must not rely on runtime CDN/network access.

An export snapshot's `fontSources` must map imported font IDs to portable real font paths. Preserve the user's source quality for zoomed UI details. Report missing files and broken resources explicitly rather than replacing them with fake product imagery.

External asset acquisition, hosted generation or publishing remains subject to the user's task and authorizations. This skill does not itself provide a media-generation service.
