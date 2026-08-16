import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import type { ImportedFont } from '~/api/types/capture-api';

const capture = vi.hoisted(() => ({
  listImportedFonts: vi.fn(),
  pickImportedFont: vi.fn(),
  onFontLibraryChanged: vi.fn(),
}));
vi.mock('~/api/capture', () => ({ capture }));

import { loadCaptionFont, useFontCatalog } from './useFontCatalog';
import type { CaptionFontOption } from './font-catalog-types';

const fontId = (value: string) => value.padEnd(64, '0').slice(0, 64);
const importedFont = (family: string, id = fontId(family.toLowerCase().replace(/[^a-z]/g, ''))) =>
  ({
    id,
    family,
    fullName: `${family} Regular`,
    extension: '.ttf',
    url: `project-media://font/${id}`,
  }) satisfies ImportedFont;

let fontFaces: Set<FakeFontFace>;
let fontFaceConstructions = 0;
let rejectFontLoad = false;
let gateFontLoads = false;
const pendingFontLoads = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();

class FakeFontFace {
  readonly family: string;
  readonly source: string;

  constructor(family: string, source: string) {
    fontFaceConstructions += 1;
    this.family = family;
    this.source = source;
  }

  async load() {
    if (rejectFontLoad) throw new Error('font load failed');
    if (!gateFontLoads) return this;
    return await new Promise<FakeFontFace>((resolve, reject) => {
      pendingFontLoads.set(this.family, { resolve: () => resolve(this), reject });
    });
  }
}

const setQueryLocalFonts = (query: (() => Promise<Array<{ family: string }>>) | undefined) => {
  Object.defineProperty(window, 'queryLocalFonts', { configurable: true, value: query });
};
const originalFontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');

const mountCatalog = () => {
  let catalog!: ReturnType<typeof useFontCatalog>;
  const wrapper = mount(
    defineComponent({
      setup() {
        catalog = useFontCatalog();
        return () => h('div');
      },
    }),
  );
  return { wrapper, catalog };
};

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  fontFaces = new Set();
  fontFaceConstructions = 0;
  rejectFontLoad = false;
  gateFontLoads = false;
  pendingFontLoads.clear();
  vi.stubGlobal('FontFace', FakeFontFace);
  Object.defineProperty(document, 'fonts', { configurable: true, value: fontFaces });
  setQueryLocalFonts(vi.fn().mockResolvedValue([]));
  capture.listImportedFonts.mockResolvedValue([]);
  capture.pickImportedFont.mockResolvedValue(null);
  capture.onFontLibraryChanged.mockReturnValue(() => undefined);
});

afterEach(() => {
  if (originalFontsDescriptor) Object.defineProperty(document, 'fonts', originalFontsDescriptor);
  else Reflect.deleteProperty(document, 'fonts');
  vi.unstubAllGlobals();
});

describe('useFontCatalog', () => {
  it('reports unavailable Local Font Access when queryLocalFonts is missing', async () => {
    setQueryLocalFonts(undefined);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    await catalog.refreshSystem();

    expect(catalog.error.value).toBe('localFontsUnavailable');
    expect(catalog.loading.value).toBe(false);
    wrapper.unmount();
  });

  it('reports a denied Local Font Access permission without dropping imported fonts', async () => {
    const installedQuery = vi.fn().mockRejectedValue(new DOMException('permission denied', 'NotAllowedError'));
    setQueryLocalFonts(installedQuery);
    const imported = importedFont('Imported Sans');
    capture.listImportedFonts.mockResolvedValue([imported]);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    await catalog.refreshSystem();

    expect(installedQuery).toHaveBeenCalledOnce();
    expect(catalog.error.value).toBe('localFontsPermissionDenied');
    expect(catalog.loading.value).toBe(false);
    expect(catalog.fonts.value).toContainEqual(
      expect.objectContaining({ value: imported.family, assetId: imported.id }),
    );
    wrapper.unmount();
  });

  it('reports a non-permission Local Font Access failure separately', async () => {
    const installedQuery = vi.fn().mockRejectedValue(new Error('font service unavailable'));
    setQueryLocalFonts(installedQuery);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    await catalog.refreshSystem();

    expect(catalog.error.value).toBe('fontLoadFailed');
    expect(catalog.loading.value).toBe(false);
    wrapper.unmount();
  });

  it('keeps the latest concurrent system refresh result', async () => {
    const first = deferred<Array<{ family: string }>>();
    const second = deferred<Array<{ family: string }>>();
    const installedQuery = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    setQueryLocalFonts(installedQuery);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    const firstRefresh = catalog.refreshSystem();
    const secondRefresh = catalog.refreshSystem();
    expect(installedQuery).toHaveBeenCalledTimes(2);

    second.resolve([{ family: 'Latest Font' }]);
    await secondRefresh;
    expect(catalog.fonts.value.map((font) => font.value)).toContain('Latest Font');

    first.resolve([{ family: 'Stale Font' }]);
    await firstRefresh;
    expect(catalog.fonts.value.map((font) => font.value)).toContain('Latest Font');
    expect(catalog.fonts.value.map((font) => font.value)).not.toContain('Stale Font');
    wrapper.unmount();
  });

  it('keeps loading true while overlapping system refreshes remain pending', async () => {
    const first = deferred<Array<{ family: string }>>();
    const second = deferred<Array<{ family: string }>>();
    const installedQuery = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    setQueryLocalFonts(installedQuery);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    const firstRefresh = catalog.refreshSystem();
    const secondRefresh = catalog.refreshSystem();
    expect(catalog.loading.value).toBe(true);

    first.resolve([{ family: 'First Font' }]);
    await firstRefresh;
    expect(catalog.loading.value).toBe(true);

    second.resolve([{ family: 'Second Font' }]);
    await secondRefresh;
    expect(catalog.loading.value).toBe(false);
    wrapper.unmount();
  });

  it('gives imported families priority over duplicate system families', async () => {
    const imported = importedFont('Inter');
    const installedQuery = vi
      .fn()
      .mockResolvedValue([{ family: 'inter' }, { family: 'System Sans' }, { family: 'system sans' }]);
    setQueryLocalFonts(installedQuery);
    capture.listImportedFonts.mockResolvedValue([imported]);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    window.dispatchEvent(new Event('focus'));
    await flushPromises();

    expect(catalog.fonts.value.filter((font) => font.value.toLocaleLowerCase() === 'inter')).toHaveLength(1);
    expect(catalog.fonts.value.find((font) => font.value.toLocaleLowerCase() === 'inter')).toMatchObject({
      value: 'Inter',
      label: 'Inter',
      assetId: imported.id,
      url: imported.url,
    });
    expect(catalog.fonts.value.filter((font) => font.value.toLocaleLowerCase() === 'system sans')).toHaveLength(1);
    wrapper.unmount();
  });

  it('refreshes installed fonts on window focus and when the catalog is explicitly opened', async () => {
    const installedQuery = vi
      .fn()
      .mockResolvedValueOnce([{ family: 'Focus Font' }])
      .mockResolvedValueOnce([{ family: 'Opened Font' }]);
    setQueryLocalFonts(installedQuery);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();
    expect(installedQuery).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(installedQuery).toHaveBeenCalledOnce();
    expect(catalog.fonts.value.map((font) => font.value)).toEqual(['sans-serif', 'Focus Font']);

    await catalog.refreshSystem();
    expect(installedQuery).toHaveBeenCalledTimes(2);
    expect(catalog.fonts.value).toContainEqual(expect.objectContaining({ value: 'Opened Font' }));
    wrapper.unmount();
  });

  it('sorts successful system font discovery before rebuilding the catalog', async () => {
    const installedQuery = vi.fn().mockResolvedValue([{ family: 'Zulu Font' }, { family: 'Alpha Font' }]);
    setQueryLocalFonts(installedQuery);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    await catalog.refreshSystem();

    expect(catalog.fonts.value.map((font) => font.value)).toEqual(['sans-serif', 'Alpha Font', 'Zulu Font']);
    wrapper.unmount();
  });

  it('refreshes imported fonts after the global library changed event', async () => {
    const first = importedFont('First Font', fontId('first'));
    const second = importedFont('Second Font', fontId('second'));
    let notifyLibraryChanged: (() => void) | undefined;
    capture.listImportedFonts.mockResolvedValueOnce([first]).mockResolvedValueOnce([second]);
    capture.onFontLibraryChanged.mockImplementation((listener: () => void) => {
      notifyLibraryChanged = listener;
      return () => undefined;
    });
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();
    expect(catalog.fonts.value).toContainEqual(expect.objectContaining({ value: first.family, assetId: first.id }));

    notifyLibraryChanged?.();
    await flushPromises();

    expect(catalog.fonts.value).toContainEqual(expect.objectContaining({ value: second.family, assetId: second.id }));
    expect(catalog.fonts.value).not.toContainEqual(expect.objectContaining({ value: first.family }));
    wrapper.unmount();
  });

  it('returns null without importing when the picker is cancelled', async () => {
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();
    capture.listImportedFonts.mockClear();
    capture.pickImportedFont.mockResolvedValue(null);

    await expect(catalog.importFont()).resolves.toBeNull();

    expect(capture.pickImportedFont).toHaveBeenCalledOnce();
    expect(capture.listImportedFonts).not.toHaveBeenCalled();
    expect(catalog.loading.value).toBe(false);
    expect(catalog.error.value).toBeNull();
    wrapper.unmount();
  });

  it.each([new Error('font list failed'), 'font list failed'])('reports listImportedFonts failures', async (cause) => {
    capture.listImportedFonts.mockRejectedValue(cause);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    expect(catalog.error.value).toBe('fontLibraryReadFailed');
    expect(catalog.loading.value).toBe(false);
    wrapper.unmount();
  });

  it('uses a safe message when the picker throws a non-Error value', async () => {
    capture.pickImportedFont.mockRejectedValue('picker failed');
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    await expect(catalog.importFont()).resolves.toBeNull();

    expect(catalog.error.value).toBe('fontImportFailed');
    expect(catalog.loading.value).toBe(false);
    wrapper.unmount();
  });

  it('returns null when an imported font is not present after refresh', async () => {
    const imported = importedFont('Missing From Catalog');
    capture.listImportedFonts.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    capture.pickImportedFont.mockResolvedValue(imported);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    await expect(catalog.importFont()).resolves.toBeNull();

    expect(catalog.error.value).toBeNull();
    expect(catalog.loading.value).toBe(false);
    expect(fontFaces.size).toBe(0);
    wrapper.unmount();
  });

  it('imports, loads, and returns a new font option', async () => {
    const imported = importedFont('Imported Display');
    capture.listImportedFonts.mockResolvedValueOnce([]).mockResolvedValueOnce([imported]);
    capture.pickImportedFont.mockResolvedValue(imported);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    await expect(catalog.importFont()).resolves.toEqual(
      expect.objectContaining({
        value: imported.family,
        label: imported.family,
        assetId: imported.id,
        url: imported.url,
      }),
    );

    expect(capture.pickImportedFont).toHaveBeenCalledOnce();
    expect(capture.listImportedFonts).toHaveBeenCalledTimes(2);
    expect(fontFaces).toContainEqual(
      expect.objectContaining({ family: imported.family, source: `url("${imported.url}")` }),
    );
    expect(catalog.error.value).toBeNull();
    expect(catalog.loading.value).toBe(false);
    wrapper.unmount();
  });

  it('reports a loaded-font failure and does not return an option', async () => {
    const imported = importedFont('Broken Display');
    rejectFontLoad = true;
    capture.listImportedFonts.mockResolvedValueOnce([]).mockResolvedValueOnce([imported]);
    capture.pickImportedFont.mockResolvedValue(imported);
    const { wrapper, catalog } = mountCatalog();
    await flushPromises();

    await expect(catalog.importFont()).resolves.toBeNull();

    expect(catalog.error.value).toBe('fontImportFailed');
    expect(catalog.loading.value).toBe(false);
    wrapper.unmount();
  });

  it('does not load generic fonts and does not add an imported face twice', async () => {
    await loadCaptionFont({ value: 'sans-serif', label: 'Beam Sans' });
    expect(fontFaces.size).toBe(0);

    const imported: CaptionFontOption = {
      value: 'Imported Display',
      label: 'Imported Display',
      assetId: fontId('imported-display'),
      url: 'project-media://font/imported-display',
    };
    await loadCaptionFont(imported);
    await loadCaptionFont(imported);

    expect(fontFaces.size).toBe(1);
  });

  it('keeps both faces when concurrent font loads finish out of order', async () => {
    gateFontLoads = true;
    const first: CaptionFontOption = {
      value: 'First Display',
      label: 'First Display',
      assetId: fontId('first-display'),
      url: 'project-media://font/first-display',
    };
    const second: CaptionFontOption = {
      value: 'Second Display',
      label: 'Second Display',
      assetId: fontId('second-display'),
      url: 'project-media://font/second-display',
    };

    const firstLoad = loadCaptionFont(first);
    const secondLoad = loadCaptionFont(second);
    pendingFontLoads.get(second.label)?.resolve();
    pendingFontLoads.get(first.label)?.resolve();
    await Promise.all([firstLoad, secondLoad]);

    expect([...fontFaces].map((face) => face.family)).toEqual(expect.arrayContaining([first.label, second.label]));
  });

  it('uses the font value as the CSS family and shares concurrent loads for one asset', async () => {
    gateFontLoads = true;
    const imported: CaptionFontOption = {
      value: 'CSS Family',
      label: 'Display Label',
      assetId: fontId('shared-load'),
      url: 'project-media://font/shared-load',
    };

    const firstLoad = loadCaptionFont(imported);
    const secondLoad = loadCaptionFont(imported);
    expect(fontFaceConstructions).toBe(1);
    pendingFontLoads.get(imported.value)?.resolve();
    await Promise.all([firstLoad, secondLoad]);

    expect(fontFaces.size).toBe(1);
    expect([...fontFaces][0]?.family).toBe(imported.value);
  });

  it('removes focus and library listeners when unmounted', async () => {
    const installedQuery = vi.fn().mockResolvedValue([{ family: 'Focus Font' }]);
    setQueryLocalFonts(installedQuery);
    const stopLibrary = vi.fn();
    capture.onFontLibraryChanged.mockReturnValue(stopLibrary);
    const { wrapper } = mountCatalog();
    await flushPromises();

    wrapper.unmount();
    expect(stopLibrary).toHaveBeenCalledOnce();
    installedQuery.mockClear();
    window.dispatchEvent(new Event('focus'));
    await flushPromises();
    expect(installedQuery).not.toHaveBeenCalled();
  });
});
