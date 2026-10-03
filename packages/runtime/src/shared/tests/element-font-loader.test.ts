import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Clip } from '@beam/engine/shared/composition-types';

let add: ReturnType<typeof vi.fn>;
let load: ReturnType<typeof vi.fn>;
let faces: Array<{ family: string; source: string }>;
const clips = (...ids: string[]) =>
  ids.map((id) => ({ kind: 'shape', text: { style: { fontAssetId: id, fontFamily: `family-${id}` } } }) as Clip);
const source = (id: string) => `project-media://font/${id}`;
beforeEach(() => {
  vi.resetModules();
  faces = [];
  add = vi.fn();
  load = vi.fn(async (face) => face);
  vi.stubGlobal(
    'FontFace',
    class {
      family: string;
      source: string;
      constructor(family: string, src: string) {
        this.family = family;
        this.source = src;
        faces.push(this);
      }
      load() {
        return load(this);
      }
    },
  );
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('starts independent imported fonts concurrently and waits for all of them', async () => {
  const { loadElementFonts } = await import('../element-font-loader');
  const finish: Array<() => void> = [];
  load.mockImplementation(
    (face) =>
      new Promise((resolve) => {
        finish.push(() => resolve(face));
      }),
  );
  const pending = loadElementFonts(clips('a'.repeat(64), 'b'.repeat(64)), source);
  expect(faces).toHaveLength(2);
  expect(add).not.toHaveBeenCalled();
  finish[0]!();
  await Promise.resolve();
  expect(add).toHaveBeenCalledOnce();
  finish[1]!();
  await pending;
  expect(add).toHaveBeenCalledTimes(2);
});
it('deduplicates identical font faces across layers and requests and ignores system fonts', async () => {
  const { loadElementFonts } = await import('../element-font-loader');
  const id = 'a'.repeat(64);
  await loadElementFonts(
    [...clips(id, id), { kind: 'shape', text: { style: { fontFamily: 'Arial' } } } as Clip],
    source,
  );
  await loadElementFonts(clips(id), source);
  expect(faces).toHaveLength(1);
});
it('retries a failed imported face without keeping a poisoned cache entry', async () => {
  const { loadElementFonts } = await import('../element-font-loader');
  const items = clips('a'.repeat(64));
  load.mockRejectedValueOnce(new Error('missing font'));
  await expect(loadElementFonts(items, source)).rejects.toThrow('missing font');
  await loadElementFonts(items, source);
  expect(faces).toHaveLength(2);
  expect(add).toHaveBeenCalledOnce();
});
it('rejects invalid identifiers and unavailable sources before fetching fonts', async () => {
  const { loadElementFonts } = await import('../element-font-loader');
  await expect(loadElementFonts(clips('invalid'), source)).rejects.toThrow('identifier');
  await expect(loadElementFonts(clips('a'.repeat(64)), () => '')).rejects.toThrow('source is unavailable');
  expect(load).not.toHaveBeenCalled();
});
it('registers faces in workers and reports an unavailable font registry', async () => {
  const { loadElementFonts } = await import('../element-font-loader');
  vi.stubGlobal('document', undefined);
  vi.stubGlobal('fonts', { add });
  await loadElementFonts(clips('a'.repeat(64)), source);
  expect(add).toHaveBeenCalledOnce();
  vi.stubGlobal('fonts', undefined);
  await expect(loadElementFonts(clips('b'.repeat(64)), source)).rejects.toThrow(
    'unavailable in this rendering context',
  );
});
