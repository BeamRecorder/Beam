import { describe, it, expect } from 'vitest';
import { validateHtmlComposition } from './html-schema.js';
import { createAuthoringSession, createRenderDocument, createStillDocument } from '../index';
import { createDefaultClipAppearance } from '../shared/composition-defaults';

const html = () => ({
  version: 1,
  id: '12345678-1234-1234-1234-123456789abc',
  revision: '23456789-1234-1234-1234-123456789abc',
  entry: 'index.html',
  width: 1920,
  height: 1080,
  durationMs: 15000,
  fps: 30,
  framework: 'html',
});
describe('persisted HTML identity', () => {
  it('accepts static and animated HTML/optional Vue', () => {
    expect(() => validateHtmlComposition(html())).not.toThrow();
    expect(() => validateHtmlComposition({ ...html(), durationMs: 0, framework: 'vue' })).not.toThrow();
  });
  it.each([
    '../index.html',
    '/index.html',
    'C:/index.html',
    'x\\index.html',
    'a//index.html',
    'a%2findex.html',
    'a?index.html',
  ])('rejects unsafe entry %s', (entry) => expect(() => validateHtmlComposition({ ...html(), entry })).toThrow());
  it.each([
    { version: 2 },
    { id: 'invalid' },
    { width: 1 },
    { height: 16385 },
    { durationMs: -1 },
    { durationMs: 0.1 },
    { fps: 0 },
    { fps: 241 },
    { framework: 'react' },
  ])('rejects invalid descriptor %j', (patch) =>
    expect(() => validateHtmlComposition({ ...html(), ...patch })).toThrow(),
  );
  it('validates HTML assets through document commands and preserves lock protection on patch', () => {
    const session = createAuthoringSession(createRenderDocument());
    session.execute({
      type: 'asset.add',
      payload: {
        id: 'asset',
        kind: 'image',
        origin: 'project',
        src: 'source.png',
        fileName: 'source.png',
        durationMs: 0,
        width: 1920,
        height: 1080,
        name: 'HTML',
        html: html(),
      },
    });
    session.execute({ type: 'asset.patch', payload: { assetId: 'asset', patch: { name: 'Updated' } } });
    expect(session.document.composition.assets[0]?.name).toBe('Updated');
    expect(() =>
      session.execute({ type: 'asset.patch', payload: { assetId: 'asset', patch: { id: 'new' } } }),
    ).toThrow();
    expect(() =>
      session.execute({ type: 'asset.patch', payload: { assetId: 'missing', patch: { name: 'new' } } }),
    ).toThrow();
    session.execute({
      type: 'clip.add',
      payload: {
        id: 'clip',
        trackId: 'clip',
        name: 'HTML',
        kind: 'image',
        assetId: 'asset',
        locked: true,
        timelineStartMs: 0,
        timelineDurationMs: 1000,
        sourceInMs: 0,
        sourceDurationMs: 1000,
        playbackRate: 1,
        enabled: true,
        order: 0,
        transitions: { entry: null, exit: null },
        transform: { x: 0, y: 0, width: 1, height: 1 },
        appearance: createDefaultClipAppearance('image'),
        isMirrored: false,
      },
    });
    expect(() =>
      session.execute({ type: 'asset.patch', payload: { assetId: 'asset', patch: { src: 'changed.png' } } }),
    ).toThrow('locked');
  });
  it('rejects animated HTML in a Screenshot layer', () => {
    const session = createAuthoringSession(createStillDocument('still', 'source.png', 1920, 1080));
    expect(() =>
      session.execute({
        type: 'still.layer.add',
        payload: {
          ...session.document.state.image,
          id: 'html',
          source: 'html.png',
          width: 1920,
          height: 1080,
          html: html(),
        },
      }),
    ).toThrow('static');
  });
});
