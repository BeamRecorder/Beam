// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCompositionCommands } from '../../commands/composition-commands';
import { group, animation, sceneDocument } from './scene-fixtures';
describe('scene and animation commands', () => {
  it('owns command payloads and applies scene and track edits', () => {
    const doc = sceneDocument(),
      commands = createCompositionCommands();
    const scene = { version: 1, roots: ['new'], groups: [group('new')] };
    const next = commands.execute(doc, { type: 'scene.set', payload: scene });
    scene.groups[0]!.opacity = 0.1;
    expect(next.scene!.groups[0]!.opacity).toBe(1);
    const track = { ...animation(), keyframes: [{ timeMs: 0, value: 0.2 }] };
    const animated = commands.execute(next, { type: 'animation.set', payload: track });
    track.keyframes[0]!.value = 99;
    expect(animated.animations!.tracks[0]!.keyframes[0]!.value).toBe(0.2);
    expect(commands.execute(animated, { type: 'animation.delete', payload: 'track' }).animations!.tracks).toEqual([]);
  });
  it.each(['scene.set', 'animation.set', 'animation.delete'])('rejects invalid %s payloads', (type) => {
    const commands = createCompositionCommands();
    for (const payload of [null, 0, '']) expect(() => commands.execute(sceneDocument(), { type, payload })).toThrow();
  });
  it('rejects invalid scenes, missing animation IDs and locked edits atomically', () => {
    const doc = sceneDocument(),
      commands = createCompositionCommands();
    expect(() => commands.execute(doc, { type: 'animation.delete', payload: 'missing' })).toThrow('Unknown animation');
    expect(() => commands.execute(doc, { type: 'scene.set', payload: {} })).toThrow('scene');
    expect(() => commands.execute(doc, { type: 'animation.set', payload: {} })).toThrow('scene');
    doc.clips[0]!.locked = true;
    for (const [type, payload] of [
      ['scene.set', doc.scene],
      ['animation.set', animation()],
      ['animation.set', { ...animation(), targetId: 'g', property: 'opacity' }],
      ['animation.delete', 'track'],
    ] as const)
      expect(() => commands.execute(doc, { type, payload })).toThrow('locked');
  });
  it('adds the first animation container to a flat document', () => {
    const doc = sceneDocument();
    delete doc.animations;
    delete doc.scene;
    expect(
      createCompositionCommands().execute(doc, { type: 'animation.set', payload: animation() }).animations!.tracks,
    ).toHaveLength(1);
  });
});
