import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCaptionStyle } from '~/media/shared/composition-defaults';
import type { ClipComposition } from '~/media/shared/composition-types';
import { loadExportFonts } from '../export-worker-fonts';

const compositionWithFont = (fontFamily = 'Aptos Display', fontAssetId = 'font-1'): ClipComposition => ({
  schemaVersion: 6,
  assets: [],
  clips: [
    {
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
        style: { ...createDefaultCaptionStyle(), fontFamily, fontAssetId },
      },
    },
  ],
  keyboardCaptionSessions: [],
});

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
        source: 'url("project-media://font/font-1")',
      },
    ]);
    expect(load).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith(faces[0]);
  });

  it('surfaces an imported font load failure and does not register the face', async () => {
    const load = vi.fn().mockRejectedValue(new Error('invalid font data'));
    const add = vi.fn();
    class FakeFontFace {
      readonly family: string;
      readonly source: string;

      constructor(family: string, source: string) {
        this.family = family;
        this.source = source;
      }

      load() {
        return load();
      }
    }
    vi.stubGlobal('FontFace', FakeFontFace);
    vi.stubGlobal('self', { fonts: { add } });

    await expect(loadExportFonts(compositionWithFont())).rejects.toThrow(
      'Unable to load imported font "Aptos Display" for export.',
    );
    expect(add).not.toHaveBeenCalled();
  });

  it('reports an unavailable Worker FontFaceSet explicitly', async () => {
    vi.stubGlobal('self', {});

    await expect(loadExportFonts(compositionWithFont())).rejects.toThrow(
      'Imported fonts are unavailable in the export Worker.',
    );
  });
});
