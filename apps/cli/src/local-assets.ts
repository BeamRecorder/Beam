import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExportRequest } from '@beam/encoder';

/** URLs reveal only registered assets, never a renderer-supplied filesystem path. */
export function registerLocalAssets(request: ExportRequest, directory: string, auth: string) {
  const files = new Map<string, string>();
  const source = (value: string) => {
    if (!value) return value;
    if (/^(https?:|data:)/i.test(value)) return value;
    if (/^(project-media:|blob:)/i.test(value))
      throw new Error('CLI export needs portable asset URLs (relative paths, file URLs or HTTP URLs).');
    const path = value.startsWith('file:') ? fileURLToPath(value) : resolve(directory, value);
    const id = randomUUID();
    files.set(id, path);
    return `/beam-cli/asset/${id}?auth=${encodeURIComponent(auth)}`;
  };
  const snapshot = request.snapshot;
  return {
    files,
    request: {
      ...request,
      snapshot: {
        ...snapshot,
        fontSources: Object.fromEntries(
          Object.entries(snapshot.fontSources ?? {}).map(([id, url]) => [id, source(url)]),
        ),
        composition: {
          ...snapshot.composition,
          assets: snapshot.composition.assets.map((asset) => ({ ...asset, src: source(asset.src) })),
        },
        background:
          snapshot.background && 'src' in snapshot.background
            ? { ...snapshot.background, src: source(snapshot.background.src) }
            : snapshot.background,
        cursorPack: snapshot.cursorPack
          ? {
              ...snapshot.cursorPack,
              cursors: snapshot.cursorPack.cursors.map((cursor) => ({ ...cursor, url: source(cursor.url) })),
            }
          : null,
      },
    } satisfies ExportRequest,
  };
}
