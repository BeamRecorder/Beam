// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ExportRequest } from '@beam/encoder';
import { registerLocalAssets } from './local-assets';
import { emptyComposition } from '@beam/engine';
const request = (src: string): ExportRequest =>
  ({
    snapshot: {
      composition: {
        ...emptyComposition(),
        assets: [
          {
            id: 'asset',
            kind: 'video',
            src,
            name: 'Media',
            fileName: null,
            durationMs: 1000,
            width: 64,
            height: 64,
            origin: 'project',
          },
        ],
      },
      background: null,
      cursorPack: null,
    },
  }) as ExportRequest;
describe('CLI local asset capabilities', () => {
  it('registers relative files under opaque URLs without mutating the request', () => {
    const input = request('media/clip.webm');
    const result = registerLocalAssets(input, '/project', 'secret');
    expect([...result.files.values()]).toEqual(['/project/media/clip.webm']);
    expect(result.request.snapshot.composition.assets[0]?.src).toMatch(/^\/beam-cli\/asset\/.+\?auth=secret$/);
    expect(input.snapshot.composition.assets[0]?.src).toBe('media/clip.webm');
  });
  it('resolves imported font files through the same opaque asset capability', () => {
    const input = request('');
    input.snapshot.fontSources = { ['a'.repeat(64)]: 'font.ttf' };
    const result = registerLocalAssets(input, '/base', 'key');
    expect([...result.files.values()]).toEqual(['/base/font.ttf']);
    expect(result.request.snapshot.fontSources?.['a'.repeat(64)]).toContain('/beam-cli/asset/');
    expect(input.snapshot.fontSources?.['a'.repeat(64)]).toBe('font.ttf');
  });
  it('accepts file URLs and preserves remote URLs', () => {
    expect([...registerLocalAssets(request('file:///project/clip.webm'), '/base', 'key').files.values()]).toEqual([
      '/project/clip.webm',
    ]);
    const remote = registerLocalAssets(request('https://example.test/clip.webm'), '/base', 'key');
    expect(remote.files.size).toBe(0);
    expect(remote.request.snapshot.composition.assets[0]?.src).toBe('https://example.test/clip.webm');
  });
  it.each(['project-media://asset/video', 'blob:http://example.test/id'])('rejects nonportable source %s', (src) => {
    expect(() => registerLocalAssets(request(src), '/base', 'key')).toThrow('portable');
  });
  it('resolves background and cursor artwork independently and preserves embedded sources', () => {
    const input = request('');
    input.snapshot.background = { kind: 'image', src: 'background.png' };
    input.snapshot.cursorPack = {
      id: 'custom',
      name: 'Custom',
      source: 'imported',
      colorMode: 'original',
      defaultCursorId: 'arrow',
      automaticMap: {},
      cursors: [
        {
          id: 'arrow',
          label: 'Arrow',
          url: 'arrow.svg',
          hotspot: { x: 0, y: 0 },
          intrinsicSize: { width: 32, height: 32 },
          nominalSize: 32,
        },
      ],
    };
    const result = registerLocalAssets(input, '/base', 'key & value');
    expect([...result.files.values()]).toEqual(['/base/background.png', '/base/arrow.svg']);
    expect(result.request.snapshot.cursorPack?.cursors[0]?.url).toContain('auth=key%20%26%20value');
    expect(result.request.snapshot.composition.assets[0]?.src).toBe('');
    expect(input.snapshot.background.src).toBe('background.png');
    const embedded = registerLocalAssets(request('data:video/webm;base64,AAAA'), '/base', 'key');
    expect(embedded.files.size).toBe(0);
    expect(embedded.request.snapshot.composition.assets[0]?.src).toBe('data:video/webm;base64,AAAA');
    input.snapshot.background = { kind: 'color', color: '#ffffff' };
    expect(registerLocalAssets(input, '/base', 'key').request.snapshot.background).toEqual(input.snapshot.background);
  });
});
