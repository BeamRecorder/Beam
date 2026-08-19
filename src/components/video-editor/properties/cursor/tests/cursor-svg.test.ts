import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MACOS_CURSOR_PACK } from '../cursor-packs';
import { svgAtRasterSize } from '../cursor-svg';

const openingTag = (svg: string) => svg.slice(0, svg.indexOf('>') + 1);

describe('svgAtRasterSize', () => {
  it('replaces source dimensions with independently ceiled raster dimensions', () => {
    const source =
      `<svg WIDTH='32' HEIGHT='16' viewBox="0 0 32 16" preserveAspectRatio="none">` + '<path />' + '</svg>';

    const result = svgAtRasterSize(source, 80.01, 40.001, '#ff00ff', false);
    const root = openingTag(result);

    expect(root).toContain('width="81"');
    expect(root).toContain('height="41"');
    expect(root).not.toContain("WIDTH='32'");
    expect(root).not.toContain("HEIGHT='16'");
    expect((root.match(/\bwidth=/gi) ?? []).length).toBe(1);
    expect((root.match(/\bheight=/gi) ?? []).length).toBe(1);
    expect(root).toContain('viewBox="0 0 32 16"');
    expect(root).toContain('preserveAspectRatio="none"');
  });

  it('clamps zero and negative raster dimensions to one pixel', () => {
    const result = svgAtRasterSize('<svg width="32" height="32"></svg>', 0, -0.5, '#000000', false);

    expect(openingTag(result)).toContain('width="1"');
    expect(openingTag(result)).toContain('height="1"');
  });

  it('tints black fills, strokes, gradient stops, and CSS declarations only', () => {
    const source = [
      '<svg viewBox="0 0 32 32">',
      '<path fill="#000" stroke="BLACK" style="fill: #000000; stroke:black; stop-color:#000;" />',
      '<linearGradient>',
      '<stop stop-color="#000000" />',
      '<stop stop-color="#fff" />',
      '</linearGradient>',
      '<path fill="#ffffff" stroke="#12ab34" />',
      '</svg>',
    ].join('');

    const result = svgAtRasterSize(source, 32, 32, '#12ab34', true);

    expect(result).toContain('color="#12ab34"');
    expect(result).toContain('fill="currentColor"');
    expect(result).toContain('stroke="currentColor"');
    expect(result).toContain('stop-color="currentColor"');
    expect(result).toContain('fill: currentColor;');
    expect(result).toContain('stroke:currentColor;');
    expect(result).toContain('stop-color:currentColor;');
    expect(result).toContain('stop-color="#fff"');
    expect(result).toContain('fill="#ffffff"');
    expect(result).toContain('stroke="#12ab34"');
  });

  it('adds a tintable implicit fill while preserving a white contour', () => {
    const source = '<svg viewBox="0 0 32 32"><path stroke="#fff" d="M0 0h32v32z" /></svg>';
    const result = svgAtRasterSize(source, 32, 32, '#ff00ff', true);
    const root = openingTag(result);

    expect(root).toContain('fill="currentColor"');
    expect(root).toContain('color="#ff00ff"');
    expect(result).toContain('stroke="#fff"');
  });

  it.each(['none', '#00ff00'])('does not overwrite an explicit root fill of %s', (fill) => {
    const source = `<svg fill="${fill}" viewBox="0 0 32 32"><path stroke="#fff" /></svg>`;
    const result = svgAtRasterSize(source, 32, 32, '#ff00ff', true);
    const root = openingTag(result);

    expect(root).toContain(`fill="${fill}"`);
    expect(root).not.toContain('fill="currentColor"');
    expect(root).toContain('color="#ff00ff"');
    expect(result).toContain('stroke="#fff"');
  });

  it('leaves an implicit fill and white contour unchanged for non-tintable artwork', () => {
    const source = '<svg viewBox="0 0 32 32"><path stroke="#fff" d="M0 0h32v32z" /></svg>';
    const result = svgAtRasterSize(source, 32, 32, '#ff00ff', false);
    const root = openingTag(result);

    expect(root).not.toContain('fill="currentColor"');
    expect(root).not.toContain('color="#ff00ff"');
    expect(result).toContain('stroke="#fff"');
  });

  it('preserves all source colours and omits the tint colour for original artwork', () => {
    const source =
      '<svg viewBox="0 0 32 32"><path fill="#000" stroke="black" style="fill:#000000;stroke:black" />' +
      '<path fill="#fff" stroke="#123456" /></svg>';

    const result = svgAtRasterSize(source, 24, 18, '#ff00ff', false);

    expect(result).not.toContain('color="#ff00ff"');
    expect(result).toContain('fill="#000"');
    expect(result).toContain('stroke="black"');
    expect(result).toContain('fill:#000000;');
    expect(result).toContain('stroke:black');
    expect(result).toContain('fill="#fff"');
    expect(result).toContain('stroke="#123456"');
  });

  it.each([
    ['cross', '#231f1f'],
    ['screenshotselection', '#231f20'],
  ] as const)('tints the near-black macOS %s artwork', (id, colour) => {
    const source = readFileSync(resolve(process.cwd(), 'public', 'macOsSvgCursors', `${id}.svg`), 'utf8');
    const result = svgAtRasterSize(source, 32, 32, '#ff00ff', true);

    expect(source).toContain(colour);
    expect(result).not.toContain(colour);
    expect(result).toContain('color="#ff00ff"');
    expect(result).toContain('currentColor');
  });

  it('gives every tintable bundled macOS cursor a currentColor paint target', () => {
    for (const asset of MACOS_CURSOR_PACK.cursors) {
      const source = readFileSync(resolve(process.cwd(), 'public', 'macOsSvgCursors', `${asset.id}.svg`), 'utf8');
      const result = svgAtRasterSize(source, 32, 32, '#ff00ff', asset.tintable === true);

      if (asset.tintable) {
        expect(result, asset.id).toContain('color="#ff00ff"');
        expect(result, asset.id).toContain('currentColor');
      } else {
        expect(result, asset.id).not.toContain('color="#ff00ff"');
      }
    }
  });

  it('preserves root attributes and viewBox while adding tint metadata', () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -2 40 36" aria-label="cursor">' + '<path />' + '</svg>';

    const result = svgAtRasterSize(source, 17.2, 19.8, '#abcdef', true);
    const root = openingTag(result);

    expect(root).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(root).toContain('viewBox="-4 -2 40 36"');
    expect(root).toContain('aria-label="cursor"');
    expect(root).toContain('width="18"');
    expect(root).toContain('height="20"');
    expect(root).toContain('color="#abcdef"');
  });

  it('does not fabricate a decodable SVG when the source is missing or has no complete root tag', () => {
    const missing = 'not an SVG image';
    const malformed = '<svg';

    expect(svgAtRasterSize(missing, 144, 144, '#ff00ff', true)).toBe(missing);
    expect(svgAtRasterSize(malformed, 144, 144, '#ff00ff', true)).toBe(malformed);
  });
});
