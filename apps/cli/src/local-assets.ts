import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExportRequest } from '@beam/encoder';
import type { CliRenderJob, StillRenderJob } from './render-job-types';

export function registerRenderAssets(request: CliRenderJob, directory: string, auth: string) {
  if ('kind' in request && request.kind === 'frame') {
    const assets = registerLocalAssets(request.request, directory, auth);
    return { files: assets.files, request: { ...request, request: assets.request } };
  }
  if (!('kind' in request)) return registerLocalAssets(request, directory, auth);
  const files = new Map<string, string>();
  const source = (value: string) => {
    if (/^(https?:|data:)/i.test(value)) return value;
    if (/^(project-media:|blob:)/i.test(value)) throw new Error('Still rendering needs portable asset URLs.');
    const id = randomUUID();
    files.set(id, value.startsWith('file:') ? fileURLToPath(value) : resolve(directory, value));
    return `/beam-cli/asset/${id}?auth=${encodeURIComponent(auth)}`;
  };
  const document = request.document,
    state = document.state;
  return {
    files,
    request: {
      ...request,
      document: {
        ...document,
        source: source(document.source),
        fontSources: Object.fromEntries(
          Object.entries(document.fontSources ?? {}).map(([id, path]) => [id, source(path)]),
        ),
        state: {
          ...state,
          images: state.images?.map((image) => ({
            ...image,
            source: source(image.source),
          })),
          background:
            state.background && 'path' in state.background
              ? { ...state.background, path: source(state.background.path) }
              : state.background,
        },
      },
      cursorPacks: request.cursorPacks?.map((pack) => ({
        ...pack,
        cursors: pack.cursors.map((cursor) => ({
          ...cursor,
          url: source(cursor.url),
        })),
      })),
    } satisfies StillRenderJob,
  };
}

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
          assets: snapshot.composition.assets.map((asset) => ({
            ...asset,
            src: source(asset.src),
          })),
        },
        background:
          snapshot.background && 'src' in snapshot.background
            ? { ...snapshot.background, src: source(snapshot.background.src) }
            : snapshot.background,
        cursorPack: snapshot.cursorPack
          ? {
              ...snapshot.cursorPack,
              cursors: snapshot.cursorPack.cursors.map((cursor) => ({
                ...cursor,
                url: source(cursor.url),
              })),
            }
          : null,
      },
    } satisfies ExportRequest,
  };
}
