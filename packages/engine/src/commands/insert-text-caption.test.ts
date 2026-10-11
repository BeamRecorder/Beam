import { describe, expect, it } from 'vitest';
import { createDefaultCaptionStyle } from '@beam/engine/shared/composition-defaults';
import {
  captionLayerKey,
  emptyComposition,
  isTextCaptionClip,
  type CaptionClip,
} from '@beam/engine/shared/composition-types';
import { colorClip } from '@beam/engine/scene/tests/scene-fixtures';
import { insertTextCaption } from './insert-text-caption';

const caption = (id: string, startMs = 0, layerId?: string): CaptionClip => ({
  id,
  kind: 'caption',
  name: id,
  timelineStartMs: startMs,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  captionLayerId: layerId,
  caption: { type: 'text', sentences: [], style: { ...createDefaultCaptionStyle(), customText: id } },
});

describe('insertTextCaption', () => {
  it('creates a separate track for an untargeted toolbar addition', () => {
    const original = { ...emptyComposition(), clips: [caption('original')] };
    const result = insertTextCaption(original, caption('new', 2000))!;
    expect(new Set(result.clips.filter(isTextCaptionClip).map(captionLayerKey)).size).toBe(2);
    expect(original.clips).toHaveLength(1);
  });

  it.each([0, 2000])('joins the requested track at %i ms without considering other occupied tracks', (startMs) => {
    const target = caption('target', 1000, 'target-track');
    const other = { ...caption('other', startMs, 'other-track'), order: 1 };
    const original = { ...emptyComposition(), clips: [target, other] };
    const result = insertTextCaption(original, caption('new', startMs), target.id)!;
    expect(result.clips.find((clip) => clip.id === 'new')).toMatchObject({
      captionLayerId: 'target-track',
      timelineStartMs: startMs,
    });
    expect(result.clips.find((clip) => clip.id === 'other')).toMatchObject({
      captionLayerId: 'other-track',
      timelineStartMs: startMs,
    });
    expect(target.captionLayerId).toBe('target-track');
  });

  it.each([false, true])('assigns a shared track to legacy captions (AI: %s)', (isAiGenerated) => {
    const first = { ...caption('first'), isAiGenerated };
    const second = { ...caption('second', 2000), isAiGenerated, order: isAiGenerated ? 0 : 1 };
    const original = { ...emptyComposition(), clips: [first, second] };
    const before = JSON.parse(JSON.stringify(original));
    const result = insertTextCaption(original, caption('new', 1000), first.id)!;
    const textClips = result.clips.filter(isTextCaptionClip);
    expect(textClips.find((clip) => clip.id === first.id)?.captionLayerId).toBe('first');
    expect(textClips.find((clip) => clip.id === 'new')?.captionLayerId).toBe('first');
    expect(textClips.find((clip) => clip.id === second.id)?.captionLayerId).toBe(isAiGenerated ? 'first' : undefined);
    expect(original).toEqual(before);
    const repeated = insertTextCaption(result, caption('next', 3000), 'new')!;
    expect(repeated.clips.find((clip) => clip.id === 'next')).toMatchObject({ captionLayerId: 'first' });
  });

  it.each(['missing', 'color'])('rejects a missing or incompatible target: %s', (targetId) => {
    const original = { ...emptyComposition(), clips: [colorClip('color')] };
    expect(insertTextCaption(original, caption('new', 2000), targetId)).toBeNull();
    expect(original.clips).toHaveLength(1);
  });

  it('rejects keyboard-caption insertion through the text command', () => {
    const keyboard: CaptionClip = {
      ...caption('keyboard'),
      caption: {
        type: 'keyboard',
        steps: [{ key: 'A', modifiers: [], offsetMs: 0 }],
        followCursor: false,
        recordedPlatform: 'linux',
        sourceSessionId: 'session',
        style: createDefaultCaptionStyle(),
      },
    };
    expect(insertTextCaption(emptyComposition(), keyboard)).toBeNull();
  });

  it.each([false, true])('rejects an insertion into a locked track (other fragment locked: %s)', (otherLocked) => {
    const first = { ...caption('first', 0, 'track'), locked: !otherLocked };
    const second = { ...caption('second', 2000, 'track'), locked: otherLocked };
    const original = { ...emptyComposition(), clips: [first, second] };
    expect(insertTextCaption(original, caption('new', 1000), first.id)).toBeNull();
    expect(original.clips).toEqual([first, second]);
  });

  it.each([0, 500, 1500])('rejects an occupied insertion at %i ms without creating a track', (startMs) => {
    const target = caption('target', 1000, 'track');
    const original = { ...emptyComposition(), clips: [target] };
    expect(insertTextCaption(original, caption('new', startMs + 1), target.id)).toBeNull();
    expect(original.clips).toEqual([target]);
  });

  it('does not change legacy track identities when validation fails', () => {
    const target = caption('target');
    const original = { ...emptyComposition(), clips: [target] };
    expect(() => insertTextCaption(original, caption('target', 1000), target.id)).toThrow('Duplicate clip');
    expect(target.captionLayerId).toBeUndefined();
    expect(original.clips).toEqual([target]);
  });
});
