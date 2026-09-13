import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Clip } from '../composition-types';
import { loadElementFonts } from '../element-fonts';

const fontId = (letter: string) => letter.repeat(64);
const shapeWithFont = (family: string, id: string) =>
  ({ kind: 'shape', text: { style: { fontFamily: family, fontAssetId: id } } }) as unknown as Clip;

const installWorkerFontContext = (
  faces: Array<{ family: string; source: string; load: ReturnType<typeof vi.fn> }>,
  add: ReturnType<typeof vi.fn>,
) => {
  class FakeFontFace {
    readonly family: string;
    readonly source: string;
    readonly load: ReturnType<typeof vi.fn>;

    constructor(family: string, source: string) {
      this.family = family;
      this.source = source;
      this.load = vi.fn().mockResolvedValue(this);
      faces.push(this);
    }
  }

  vi.stubGlobal('document', undefined);
  vi.stubGlobal('fonts', { add });
  vi.stubGlobal('FontFace', FakeFontFace);
};

afterEach(() => vi.unstubAllGlobals());

describe('shared imported font loader', () => {
  it('registers imported fonts in the worker font set when document is unavailable', async () => {
    const faces: Array<{ family: string; source: string; load: ReturnType<typeof vi.fn> }> = [];
    const add = vi.fn();
    installWorkerFontContext(faces, add);
    const id = fontId('a');

    await loadElementFonts([shapeWithFont('Beam Sans', id)]);

    expect(faces).toEqual([
      expect.objectContaining({
        family: 'Beam Sans',
        source: `url("project-media://font/${id}")`,
      }),
    ]);
    expect(faces[0]!.load).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith(faces[0]);
  });

  it('deduplicates concurrent font requests and registers only after loading resolves', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const faces: Array<{ family: string; source: string; load: ReturnType<typeof vi.fn> }> = [];
    const add = vi.fn();
    installWorkerFontContext(faces, add);
    const id = fontId('b');
    vi.stubGlobal(
      'FontFace',
      class {
        readonly family = 'Inter';
        readonly source = `url("project-media://font/${id}")`;
        readonly load = vi.fn(() => gate);

        constructor(family: string, source: string) {
          Object.defineProperty(this, 'family', { value: family });
          Object.defineProperty(this, 'source', { value: source });
          faces.push(this);
        }
      },
    );

    let firstFinished = false;
    let secondFinished = false;
    const first = loadElementFonts([shapeWithFont('Inter', id)]).then(() => {
      firstFinished = true;
    });
    const second = loadElementFonts([shapeWithFont('Inter', id)]).then(() => {
      secondFinished = true;
    });
    await Promise.resolve();

    expect(faces).toHaveLength(1);
    expect(faces[0]!.load).toHaveBeenCalledOnce();
    expect(add).not.toHaveBeenCalled();
    expect(firstFinished).toBe(false);
    expect(secondFinished).toBe(false);

    finish();
    await Promise.all([first, second]);

    expect(firstFinished).toBe(true);
    expect(secondFinished).toBe(true);
    expect(add).toHaveBeenCalledOnce();
  });

  it('loads distinct family registrations separately and ignores clips without imported fonts', async () => {
    const faces: Array<{ family: string; source: string; load: ReturnType<typeof vi.fn> }> = [];
    const add = vi.fn();
    installWorkerFontContext(faces, add);
    const id = fontId('c');
    const systemText = { kind: 'shape', text: { style: { fontFamily: 'Arial' } } } as unknown as Clip;

    await loadElementFonts([systemText, shapeWithFont('Inter', id), shapeWithFont('Inter Display', id)]);

    expect(faces.map((face) => face.family)).toEqual(['Inter', 'Inter Display']);
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('loads text-caption fonts and ignores shapes without embedded text', async () => {
    const faces: Array<{ family: string; source: string; load: ReturnType<typeof vi.fn> }> = [];
    const add = vi.fn();
    installWorkerFontContext(faces, add);
    const id = fontId('f');
    const caption = {
      kind: 'caption',
      caption: { style: { fontFamily: 'Caption Face', fontAssetId: id } },
    } as unknown as Clip;
    const emptyShape = { kind: 'shape' } as unknown as Clip;
    const imageClip = { kind: 'image' } as unknown as Clip;

    await loadElementFonts([emptyShape, imageClip, caption]);

    expect(faces.map((face) => face.family)).toEqual(['Caption Face']);
    expect(add).toHaveBeenCalledOnce();
  });

  it('prefers document.fonts in the renderer when both font sets exist', async () => {
    const faces: Array<{ family: string; source: string; load: ReturnType<typeof vi.fn> }> = [];
    const rendererFonts = { add: vi.fn() };
    const workerFonts = { add: vi.fn() };
    installWorkerFontContext(faces, workerFonts.add);
    vi.stubGlobal('document', { fonts: rendererFonts });

    await loadElementFonts([shapeWithFont('Renderer Face', fontId('9'))]);

    expect(rendererFonts.add).toHaveBeenCalledOnce();
    expect(rendererFonts.add).toHaveBeenCalledWith(faces[0]);
    expect(workerFonts.add).not.toHaveBeenCalled();
  });

  it('rejects malformed ids before constructing a font face', async () => {
    const faces: Array<{ family: string; source: string; load: ReturnType<typeof vi.fn> }> = [];
    installWorkerFontContext(faces, vi.fn());

    await expect(loadElementFonts([shapeWithFont('Broken', 'not-a-font-id')])).rejects.toThrow(
      'Invalid imported font identifier.',
    );
    expect(faces).toHaveLength(0);
  });

  it('does not keep a failed font load cached and retries successfully', async () => {
    const faces: Array<{ family: string; source: string; load: ReturnType<typeof vi.fn> }> = [];
    const add = vi.fn();
    const load = vi.fn().mockRejectedValueOnce(new Error('bad font data')).mockResolvedValue(undefined);
    class FakeFontFace {
      readonly family: string;
      readonly source: string;

      constructor(family: string, source: string) {
        this.family = family;
        this.source = source;
        faces.push(this as unknown as (typeof faces)[number]);
      }

      load() {
        return load();
      }
    }
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('fonts', { add });
    vi.stubGlobal('FontFace', FakeFontFace);
    const id = fontId('d');

    await expect(loadElementFonts([shapeWithFont('Retry Font', id)])).rejects.toThrow('bad font data');
    await loadElementFonts([shapeWithFont('Retry Font', id)]);

    expect(load).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledOnce();
  });

  it('fails when imported fonts are loaded without a font set, then succeeds after one becomes available', async () => {
    const faces: Array<{ family: string; source: string; load: ReturnType<typeof vi.fn> }> = [];
    const add = vi.fn();
    installWorkerFontContext(faces, add);
    vi.stubGlobal('fonts', undefined);
    const id = fontId('e');

    await expect(loadElementFonts([shapeWithFont('Needs Font Set', id)])).rejects.toThrow(
      'Imported fonts are unavailable in this rendering context.',
    );
    vi.stubGlobal('fonts', { add });
    await loadElementFonts([shapeWithFont('Needs Font Set', id)]);

    expect(faces).toHaveLength(2);
    expect(add).toHaveBeenCalledOnce();
  });
});
