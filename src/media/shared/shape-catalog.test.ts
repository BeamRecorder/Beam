import { describe, expect, it } from 'vitest';
import { isShapeKind, SHAPE_CATALOG, shapeDefinition, shapeDisplayName, type ShapeKind } from './shape-catalog';
import { SHAPE_GALLERY_PATHS } from './shape-gallery-paths';

describe('shape catalog', () => {
  it('contains unique, renderable vector definitions', () => {
    expect(SHAPE_CATALOG).toHaveLength(94);
    expect(new Set(SHAPE_CATALOG.map(({ id }) => id)).size).toBe(SHAPE_CATALOG.length);
    for (const definition of SHAPE_CATALOG) {
      expect(definition.path).toMatch(/^M/i);
      expect(definition.viewBox).toBe(`0 0 ${definition.width} ${definition.height}`);
      expect(definition.keywords.length).toBeGreaterThan(0);
    }
  });

  it('recognizes every catalog id and resolves it to the same definition', () => {
    for (const definition of SHAPE_CATALOG) {
      expect(isShapeKind(definition.id)).toBe(true);
      expect(shapeDefinition(definition.id)).toBe(definition);
    }
    expect(isShapeKind('not-a-shape')).toBe(false);
  });

  it('includes both standard diagram shapes and the curated gallery artwork', () => {
    const ids = new Set<ShapeKind>(SHAPE_CATALOG.map(({ id }) => id));
    expect(ids.has('rectangle')).toBe(true);
    expect(ids.has('speech-bubble')).toBe(true);
    expect(ids.has('sparkle-quad')).toBe(true);
    expect([...ids]).toEqual(
      expect.arrayContaining(['rectangle', 'heart', 'speech-bubble', 'sparkle-quad', 'ribbon-arch']),
    );
    expect(shapeDisplayName('heart', 'fr-FR')).toBe('Cœur');
    expect(shapeDisplayName('heart', 'en-US')).toBe('Heart');
    expect(shapeDisplayName('gallery-2', 'fr-FR')).toBe('Forme 2');
  });

  it('contains every exact vector path from the 72-shape gallery pack', () => {
    const normalizedCatalogPaths = new Set(
      SHAPE_CATALOG.filter(({ width, height }) => width === 256 && height === 256).map(({ path }) =>
        path.replace(/\s+/g, ''),
      ),
    );

    expect(SHAPE_GALLERY_PATHS).toHaveLength(72);
    expect(normalizedCatalogPaths.size).toBe(72);
    for (const path of SHAPE_GALLERY_PATHS) expect(normalizedCatalogPaths.has(path.replace(/\s+/g, ''))).toBe(true);
  });
});
