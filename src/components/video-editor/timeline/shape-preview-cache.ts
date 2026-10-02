import type { ShapeClip } from '@beam/engine/shared/composition-types';
import type { ShapeTimelinePreviewProps } from './shape-timeline-preview-types';
import type { ShapePreviewCacheEntry } from './shape-preview-cache-types';

export const SHAPE_PREVIEW_FIELDS = [
  'family',
  'preset',
  'fillEnabled',
  'fill',
  'fillColor',
  'borderColor',
  'borderWidth',
  'cornerRadius',
  'arrowThickness',
  'arrowHeadSize',
  'rotation',
  'opacityEnabled',
  'opacity',
  'backdropBlur',
  'shadowEnabled',
  'shadowColor',
  'shadowBlur',
  'shadowDirection',
  'text',
  'drawing',
] as const;

export const shapePreviewSignature = (clip: ShapeClip, canvas: NonNullable<ShapeTimelinePreviewProps['canvas']>) =>
  JSON.stringify([
    ...SHAPE_PREVIEW_FIELDS.map((field) => clip[field]),
    clip.transform.width,
    clip.transform.height,
    canvas.width,
    canvas.height,
  ]);

// Identical artwork is common after copying shape clips. Share in-flight work
// as well as PNGs, with bounds on both entry count and retained string bytes.
export class ShapePreviewCache {
  private entries = new Map<string, ShapePreviewCacheEntry>();
  private bytes = 0;
  private generation = 0;
  private maxEntries: number;
  private maxBytes: number;

  constructor(maxEntries = 64, maxBytes = 4 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 0 || !Number.isFinite(maxBytes) || maxBytes < 0)
      throw new RangeError('Invalid shape preview cache limits.');
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  get(key: string, render: (isCurrent: () => boolean) => Promise<string>): Promise<string> {
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.preview;
    }
    const generation = this.generation;
    const entry: ShapePreviewCacheEntry = {
      preview: Promise.resolve().then(() => render(() => this.generation === generation)),
      bytes: key.length * 2,
    };
    this.entries.set(key, entry);
    this.bytes += entry.bytes;
    this.trim();
    void entry.preview.then(
      (preview) => {
        if (this.entries.get(key) !== entry) return;
        const addedBytes = preview.length * 2;
        entry.bytes += addedBytes;
        this.bytes += addedBytes;
        this.trim();
      },
      () => {
        if (this.entries.get(key) !== entry) return;
        this.entries.delete(key);
        this.bytes -= entry.bytes;
      },
    );
    return entry.preview;
  }

  clear() {
    this.generation += 1;
    this.entries.clear();
    this.bytes = 0;
  }

  private trim() {
    while (this.entries.size && (this.entries.size > this.maxEntries || this.bytes > this.maxBytes)) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
  }
}

export const shapePreviewCache = new ShapePreviewCache();
let subscribers = 0;
export function retainShapePreviewCache() {
  subscribers += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    subscribers -= 1;
    if (!subscribers) shapePreviewCache.clear();
  };
}
