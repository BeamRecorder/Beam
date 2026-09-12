import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPOSITION_SCHEMA_VERSION,
  type CaptionClip,
  type ClipComposition,
  type ShapeClip,
} from '~/media/shared/composition-types';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import { loadExportFonts } from '../export-worker-fonts';

const fontId = 'a'.repeat(64);
const fontStyle = (fontFamily: string, fontAssetId: string) => ({
  ...createDefaultCaptionStyle(),
  fontFamily,
  fontAssetId,
});

const captionWithFont = (fontFamily = 'Aptos Display', fontAssetId = fontId): CaptionClip => ({
  id: 'caption',
  kind: 'caption',
  name: 'Caption',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  caption: {
    type: 'text',
    sentences: [],
    style: fontStyle(fontFamily, fontAssetId),
  },
});

const shapeTextWithFont = (fontFamily = 'Aptos Display', fontAssetId = fontId): ShapeClip => ({
  id: 'text-element',
  trackId: 'text-track',
  kind: 'shape',
  name: 'Text element',
  assetId: '',
  timelineStartMs: 0,
  timelineDurationMs: 1_000,
  sourceInMs: 0,
  sourceDurationMs: 1_000,
  playbackRate: 1,
  enabled: true,
  order: 0,
  transform: { x: 0.1, y: 0.1, width: 0.8, height: 0.4 },
  family: 'text',
  preset: 'text',
  fillColor: '#ffffff',
  borderColor: '#ffffff',
  borderWidth: 0,
  cornerRadius: 16,
  arrowThickness: 36,
  arrowHeadSize: 38,
  rotation: 0,
  opacityEnabled: false,
  opacity: 70,
  backdropBlur: 35,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 32,
  shadowDirection: 'bottom-right',
  text: {
    content: 'A text element',
    padding: 6,
    verticalAlign: 'center',
    style: fontStyle(fontFamily, fontAssetId),
  },
});

const compositionWithClips = (clips: ClipComposition['clips']): ClipComposition => ({
  schemaVersion: COMPOSITION_SCHEMA_VERSION,
  assets: [],
  clips,
  keyboardCaptionSessions: [],
});

const compositionWithFont = (fontFamily = 'Aptos Display', fontAssetId = fontId): ClipComposition =>
  compositionWithClips([captionWithFont(fontFamily, fontAssetId)]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('export worker font loading', () => {
  it('loads each imported font face and registers it before rendering', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn();
    const faces: Array<{ family: string; source: string }> = [];
    class FakeFontFace {
      readonly family: string;
      readonly source: string;

      constructor(family: string, source: string) {
        this.family = family;
        this.source = source;
        faces.push(this);
      }

      load() {
        return load();
      }
    }
    vi.stubGlobal('FontFace', FakeFontFace);
    vi.stubGlobal('self', { fonts: { add } });

    await loadExportFonts(compositionWithFont());

    expect(faces).toEqual([
      {
        family: 'Aptos Display',
        source: `url("project-media://font/${fontId}")`,
      },
    ]);
    expect(load).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith(faces[0]);
  });

  it('waits for ShapeClip.text fonts and deduplicates them with caption references', async () => {
    let resolveLoad!: () => void;
    const loadGate = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    const load = vi.fn().mockReturnValue(loadGate);
    const add = vi.fn();
    const faces: Array<{ family: string; source: string }> = [];
    class FakeFontFace {
      readonly family: string;
      readonly source: string;

      constructor(family: string, source: string) {
        this.family = family;
        this.source = source;
        faces.push(this);
      }

      load() {
        return load(this);
      }
    }
    vi.stubGlobal('FontFace', FakeFontFace);
    vi.stubGlobal('self', { fonts: { add } });
    let finished = false;

    const pending = loadExportFonts(
      compositionWithClips([
        captionWithFont(),
        shapeTextWithFont(),
        { ...shapeTextWithFont(), id: 'second-text-element' },
      ]),
    ).then(() => {
      finished = true;
    });
    await Promise.resolve();

    expect(finished).toBe(false);
    expect(faces).toHaveLength(1);
    expect(add).not.toHaveBeenCalled();
    resolveLoad();
    await pending;

    expect(finished).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
    expect(faces[0]).toEqual({
      family: 'Aptos Display',
      source: `url("project-media://font/${fontId}")`,
    });
  });

  it('surfaces a ShapeClip.text font failure and retries on the next export', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('invalid font data')).mockResolvedValue(undefined);
    const add = vi.fn();
    const faces: Array<{ family: string; source: string }> = [];
    class FakeFontFace {
      readonly family: string;
      readonly source: string;

      constructor(family: string, source: string) {
        this.family = family;
        this.source = source;
        faces.push(this);
      }

      load() {
        return load();
      }
    }
    vi.stubGlobal('FontFace', FakeFontFace);
    vi.stubGlobal('self', { fonts: { add } });

    await expect(loadExportFonts(compositionWithClips([shapeTextWithFont()]))).rejects.toThrow(
      'Unable to load imported font "Aptos Display" for export.',
    );
    expect(add).not.toHaveBeenCalled();

    await loadExportFonts(compositionWithClips([shapeTextWithFont()]));

    expect(faces).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledOnce();
  });

  it('reports an unavailable Worker FontFaceSet explicitly', async () => {
    vi.stubGlobal('self', {});

    await expect(loadExportFonts(compositionWithFont())).rejects.toThrow(
      'Imported fonts are unavailable in the export Worker.',
    );
  });
});
