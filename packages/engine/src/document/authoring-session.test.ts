// @vitest-environment node
import { expect, it } from 'vitest';
import { createAuthoringSession } from './authoring-session';
import { createRenderDocument } from './render-document';
import { createStillDocument } from '../screenshot/still-document';
import { colorClip } from '../scene/tests/scene-fixtures';
it('authors full video documents through composition commands and settings with one shared history', async () => {
  const session = createAuthoringSession(createRenderDocument(undefined, 64, 64, 25)),
    before = session.document;
  session.transaction([
    { type: 'clip.add', payload: colorClip() },
    { type: 'render.patch', payload: { blurPercent: 15 } },
  ]);
  expect(session.document.duration).toBe(1);
  expect(session.document.blurPercent).toBe(15);
  await session.undo();
  expect(session.document).toBe(before);
  await session.redo();
  expect(session.document.composition.clips).toHaveLength(1);
});
it('authors an image with the same session API and preserves unchanged layer identities', () => {
  const session = createAuthoringSession(createStillDocument('image', 'source.png', 64, 64)),
    initial = session.document;
  session.execute({ type: 'still.background.set', payload: { kind: 'color', color: '#123456' } });
  expect(session.document.state.image).toBe(initial.state.image);
  session.execute({ type: 'still.background.set', payload: null });
  expect(session.document.state.background).toBeNull();
});
it('validates settings and unknown commands before publishing a revision', () => {
  const session = createAuthoringSession(createRenderDocument()),
    initial = session.document;
  for (const payload of [
    { duration: 1 },
    { blurPercent: -1 },
    { background: { kind: 'gradient', gradient: {} } },
    { canvas: { ...initial.canvas, showBackground: 'yes' } },
    { zooms: [{ id: 'zoom' }] },
    { render: { fps: 300 } },
  ])
    expect(() => session.execute({ type: 'render.patch', payload })).toThrow();
  expect(() => session.execute({ type: 'unknown', payload: null })).toThrow();
  expect(session.document).toBe(initial);
  expect(session.revision).toBe(0);
});
