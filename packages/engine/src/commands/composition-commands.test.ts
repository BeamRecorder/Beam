// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createComposition, createDefaultClipAppearance } from '../index';
import type { Clip } from '../shared/composition-types';
import { createCompositionCommands, executeCompositionCommand } from './composition-commands';

const document = (locked = false) =>
  createComposition(
    [
      {
        id: 'media',
        kind: 'video',
        name: 'Source',
        fileName: null,
        durationMs: 5000,
        width: 64,
        height: 64,
        src: 'https://example.test/media.webm',
        origin: 'project',
      },
    ],
    [
      {
        id: 'clip',
        kind: 'video',
        assetId: 'media',
        name: 'Source',
        timelineStartMs: 0,
        timelineDurationMs: 2000,
        sourceInMs: 0,
        sourceDurationMs: 2000,
        playbackRate: 1,
        enabled: true,
        locked,
        order: 0,
        trackId: 'clip',
        transitions: { entry: null, exit: null },
        transform: { x: 0, y: 0, width: 1, height: 1 },
        appearance: createDefaultClipAppearance('video'),
        isMirrored: false,
        isMirroredY: false,
      },
    ],
  );

describe('composition command boundary', () => {
  it('dispatches edits without mutating the input', () => {
    const before = document();
    const after = executeCompositionCommand(before, { type: 'clip.move', payload: { clipId: 'clip', startMs: 1000 } });
    expect(before.clips[0]?.timelineStartMs).toBe(0);
    expect(after.clips[0]?.timelineStartMs).toBe(1000);
  });
  it('splits, trims and detaches through the existing domain operations', () => {
    const commands = createCompositionCommands();
    const split = commands.execute(document(), { type: 'clip.split', payload: { clipId: 'clip', timeMs: 1000 } });
    expect(split.clips).toHaveLength(2);
    const trim = commands.execute(document(), {
      type: 'clip.trim',
      payload: { clipId: 'clip', edge: 'end', timeMs: 1500 },
    });
    expect(trim.clips[0]?.timelineDurationMs).toBe(1500);
    expect(commands.execute(document(), { type: 'clip.detach', payload: { clipId: 'clip' } }).clips).toHaveLength(1);
  });
  it('updates rate, enabled state and stacking; removes clips', () => {
    const commands = createCompositionCommands();
    expect(
      commands.execute(document(), { type: 'clip.rate', payload: { clipId: 'clip', rate: 2 } }).clips[0]
        ?.timelineDurationMs,
    ).toBe(1000);
    expect(
      commands.execute(document(), { type: 'clip.enable', payload: { clipId: 'clip', enabled: false } }).clips[0]
        ?.enabled,
    ).toBe(false);
    expect(
      commands.execute(document(), { type: 'clip.reorder', payload: { clipId: 'clip', index: 0 } }).clips[0]?.order,
    ).toBe(0);
    expect(commands.execute(document(), { type: 'clip.delete', payload: { clipId: 'clip' } }).clips).toEqual([]);
  });
  it('uses the existing audio volume validation', () => {
    const composition = document();
    composition.clips = [
      {
        ...composition.clips[0],
        id: 'audio',
        trackId: undefined,
        kind: 'audio',
        assetId: 'media',
        role: 'imported',
        volume: 100,
      } as Clip,
    ];
    expect(
      createCompositionCommands().execute(composition, {
        type: 'clip.volume',
        payload: { clipId: 'audio', volume: 50 },
      }).clips[0],
    ).toMatchObject({ volume: 50 });
  });
  it.each([
    null,
    [],
    {},
    { clipId: '', startMs: 1 },
    { clipId: 'clip', startMs: NaN },
    { clipId: 'clip', startMs: '1' },
  ])('rejects invalid payload %j', (payload) => {
    expect(() => executeCompositionCommand(document(), { type: 'clip.move', payload })).toThrow();
  });
  it('rejects invalid trim/enable values, unknown commands and locked changes', () => {
    expect(() =>
      executeCompositionCommand(document(), {
        type: 'clip.trim',
        payload: { clipId: 'clip', edge: 'middle', timeMs: 1 },
      }),
    ).toThrow('edge');
    expect(() =>
      executeCompositionCommand(document(), { type: 'clip.enable', payload: { clipId: 'clip', enabled: 1 } }),
    ).toThrow('enabled');
    expect(() => executeCompositionCommand(document(), { type: 'missing', payload: {} })).toThrow('Unknown');
    expect(() =>
      executeCompositionCommand(document(true), { type: 'clip.move', payload: { clipId: 'clip', startMs: 1000 } }),
    ).toThrow('locked');
  });
});
