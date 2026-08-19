import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CursorAssetDescriptor, CursorPackDescriptor } from '~/api/types/cursor-pack';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import { cursorAssetSupportsTint, MACOS_CURSOR_PACK, orderedCursorPacks, resolveCursorAsset } from '../cursor-packs';

const BUILTIN_PACKS = [
  ['builtin:macos', 'macOS'],
  ['builtin:bibata-material-noir', 'Material Bibata Noir'],
  ['builtin:bibata-material-white', 'Material Bibata White'],
  ['builtin:noir', 'Noir'],
  ['builtin:noir-white', 'Noir White'],
  ['builtin:moga-dark', 'Moga Dark'],
  ['builtin:moga-white', 'Moga White'],
] as const;

const importedPack = (id: string, name: string): CursorPackDescriptor => ({
  id,
  name,
  source: 'imported',
  colorMode: 'original',
  defaultCursorId: 'default',
  cursors: [
    {
      id: 'default',
      label: `${name} Default`,
      url: `project-media://cursor/${id}/default.png`,
      format: 'png',
      intrinsicSize: { width: 32, height: 32 },
      nominalSize: 32,
      hotspot: { x: 0, y: 0 },
    },
  ],
  automaticMap: { default: 'default' },
});

const bundledAssetPath = (url: string) =>
  resolve(process.cwd(), 'public', new URL(url, 'http://beam.test').pathname.slice(1));

const fixtureAsset = (id: string, format: 'svg' | 'png', tintable: boolean): CursorAssetDescriptor => ({
  id,
  label: id,
  url: `project-media://cursor/${id}.${format}`,
  format,
  tintable,
  intrinsicSize: { width: 32, height: 32 },
  nominalSize: 32,
  hotspot: { x: 0, y: 0 },
});

describe('cursor pack catalog', () => {
  it('ships the six non-macOS builtins while keeping macOS first and default', () => {
    const packs = orderedCursorPacks([]);

    expect(packs.map((pack) => [pack.id, pack.name])).toEqual(BUILTIN_PACKS);
    expect(packs[0]).toBe(MACOS_CURSOR_PACK);
    expect(packs[0]?.source).toBe('builtin');
    expect(packs[0]?.id).toBe('builtin:macos');
  });

  it('keeps the builtin order ahead of imported packs and sorts imports deterministically', () => {
    const packs = orderedCursorPacks([
      importedPack('pack:zeta', 'Zeta'),
      importedPack('pack:alpha-2', 'Alpha 2'),
      importedPack('pack:alpha', 'Alpha'),
    ]);

    expect(packs.map((pack) => pack.id)).toEqual([
      ...BUILTIN_PACKS.map(([id]) => id),
      'pack:alpha',
      'pack:alpha-2',
      'pack:zeta',
    ]);
  });

  it('resolves every non-macOS builtin asset as a bundled PNG URL', () => {
    const builtinPacks = orderedCursorPacks([]).slice(1);

    expect(builtinPacks).toHaveLength(6);
    for (const pack of builtinPacks) {
      expect(pack.source).toBe('builtin');
      expect(pack.colorMode).toBe('original');
      expect(pack.cursors.length).toBeGreaterThan(0);
      for (const asset of pack.cursors) {
        expect(asset.format).toBe('png');
        expect(asset.url).toMatch(/\.png$/i);
        expect(resolvePublicAssetUrl(asset.url)).toMatch(/\.png$/i);
        expect(existsSync(bundledAssetPath(asset.url))).toBe(true);
      }
    }
  });

  it('uses each bundled macOS SVG as the sole cursor source', () => {
    expect(MACOS_CURSOR_PACK.colorMode).toBe('tintable');
    for (const asset of MACOS_CURSOR_PACK.cursors) {
      expect(asset.format).toBe('svg');
      expect(asset.url).toMatch(new RegExp(`/macOsSvgCursors/${asset.id}\\.svg$`));
      expect(asset.url).not.toContain('macOsPngCursors');
      const svgPath = bundledAssetPath(asset.url);
      expect(existsSync(svgPath)).toBe(true);
      expect(readFileSync(svgPath, 'utf8').trimStart()).toMatch(/^<svg\b/i);
    }
  });

  it('resolves tintability per asset for mixed packs', () => {
    const pack: CursorPackDescriptor = {
      id: 'pack:mixed-tintability',
      name: 'Mixed tintability',
      source: 'imported',
      colorMode: 'tintable',
      defaultCursorId: 'black-svg',
      cursors: [
        fixtureAsset('black-svg', 'svg', true),
        fixtureAsset('coloured-svg', 'svg', false),
        fixtureAsset('png', 'png', false),
      ],
      automaticMap: { default: 'black-svg' },
    };

    expect(cursorAssetSupportsTint(pack, pack.cursors[0]!)).toBe(true);
    expect(cursorAssetSupportsTint(pack, pack.cursors[1]!)).toBe(false);
    expect(cursorAssetSupportsTint(pack, pack.cursors[2]!)).toBe(false);
  });

  it('marks only the original-colour macOS beachball non-tintable', () => {
    const byId = new Map(MACOS_CURSOR_PACK.cursors.map((asset) => [asset.id, asset]));

    expect(byId.get('default')?.tintable).toBe(true);
    expect(byId.get('textcursor')?.tintable).toBe(true);
    expect(byId.get('beachball')?.tintable).toBe(false);
    expect(byId.get('cross')?.tintable).toBe(true);
    expect(byId.get('screenshotselection')?.tintable).toBe(true);
    expect(cursorAssetSupportsTint(MACOS_CURSOR_PACK, byId.get('beachball')!)).toBe(false);
    expect(cursorAssetSupportsTint(MACOS_CURSOR_PACK, byId.get('cross')!)).toBe(true);
    expect(cursorAssetSupportsTint(MACOS_CURSOR_PACK, byId.get('screenshotselection')!)).toBe(true);
  });

  it('validates builtin mappings and falls back to each pack default', () => {
    for (const pack of orderedCursorPacks([])) {
      const assetIds = new Set(pack.cursors.map((asset) => asset.id));
      expect(assetIds.has(pack.defaultCursorId)).toBe(true);
      for (const mappedId of Object.values(pack.automaticMap)) expect(assetIds.has(mappedId)).toBe(true);

      const defaultAsset = pack.cursors.find((asset) => asset.id === pack.defaultCursorId);
      expect(defaultAsset).toBeDefined();
      expect(
        resolveCursorAsset(pack, { packId: pack.id, mode: 'automatic', cursorId: null }, 'unknown-recorded-role'),
      ).toBe(defaultAsset);
      expect(
        resolveCursorAsset(
          pack,
          { packId: pack.id, mode: 'fixed', cursorId: 'missing-cursor' },
          'unknown-recorded-role',
        ),
      ).toBe(defaultAsset);
    }
  });
});
