import { describe, expect, it } from 'vitest';
import type { HistoryAction } from '../editor-history-types';
import { describeHistoryAction } from '../history-description';
import { historyClip, screenshotSnapshot, videoSnapshot } from './history-description-fixtures';

const describeChange = (before: object, after: object, type: HistoryAction['type'] = 'undo') =>
  describeHistoryAction({ type, timestamp: 1, snapshots: { before, after } });

describe('history descriptions', () => {
  it('leaves actions without snapshots undescribed', () => {
    expect(describeHistoryAction({ type: 'undo', timestamp: 1 })).toBeNull();
  });

  it.each(['undo', 'redo'] as const)('identifies additions consistently for %s', (type) => {
    const before = videoSnapshot();
    const after = structuredClone(before);
    after.composition.clips.push(historyClip());
    expect(describeChange(before, after, type)).toEqual({
      operation: 'add',
      target: 'image',
      name: 'demo.png',
    });
  });

  it.each(['screen', 'video', 'image', 'webcam', 'color', 'audio', 'caption', 'shape', 'blur'] as const)(
    'identifies deletion of a %s clip',
    (kind) => {
      const before = videoSnapshot();
      before.composition.clips.push(historyClip(kind));
      const after = structuredClone(before);
      after.composition.clips = [];
      const target = kind === 'shape' ? 'text' : kind;
      expect(describeChange(before, after)).toMatchObject({
        operation: 'remove',
        target,
      });
    },
  );

  it.each([
    ['move', { transform: { x: 0.2, y: 0.3, width: 1, height: 1 } }],
    ['resize', { transform: { x: 0, y: 0, width: 0.5, height: 1 } }],
    ['crop', { crop: { x: 0, y: 0, width: 0.5, height: 1 } }],
    ['visibility', { enabled: false }],
    ['reorder', { order: 2, trackId: 'track-2' }],
    ['rename', { name: 'renamed.png' }],
    ['timing', { timelineDurationMs: 2000 }],
    ['edit', { isMirrored: true }],
    ['edit', { enabled: false, timelineDurationMs: 2000 }],
  ])('classifies %s edits to a clip', (operation, patch) => {
    const before = videoSnapshot();
    before.composition.clips.push(historyClip());
    const after = structuredClone(before);
    Object.assign(after.composition.clips[0]!, patch);
    expect(describeChange(before, after)).toMatchObject({
      operation,
      target: 'image',
    });
  });

  it('uses the caption sentence when no custom text is stored', () => {
    const before = videoSnapshot();
    const caption = historyClip('caption');
    if (caption.kind !== 'caption' || caption.caption.type !== 'text') throw new Error('Expected text caption');
    delete caption.caption.style.customText;
    caption.caption.sentences.push({
      id: 'sentence',
      text: 'Recorded sentence',
      startMs: 0,
      endMs: 1000,
      words: [],
    });
    const after = structuredClone(before);
    after.composition.clips.push(caption);
    expect(describeChange(before, after)).toMatchObject({
      target: 'caption',
      name: 'Recorded sentence',
    });
  });

  it('identifies keyboard captions without fabricated text', () => {
    const before = videoSnapshot();
    const after = structuredClone(before);
    const caption = historyClip('caption');
    if (caption.kind !== 'caption') throw new Error('Expected caption');
    caption.caption = {
      type: 'keyboard',
      steps: [],
      followCursor: false,
      recordedPlatform: 'linux',
      sourceSessionId: 'session',
      style: caption.caption.style,
    };
    after.composition.clips.push(caption);
    expect(describeChange(before, after)).toMatchObject({
      operation: 'add',
      target: 'keyboardCaption',
      name: undefined,
    });
  });

  it.each(['add', 'remove'] as const)('handles %s of an optional caption transform', (operation) => {
    const before = videoSnapshot();
    const caption = historyClip('caption');
    if (caption.kind !== 'caption') throw new Error('Expected caption');
    const transform = { x: 0.1, y: 0.2, width: 0.8, height: 0.14 };
    if (operation === 'remove') caption.transform = transform;
    before.composition.clips.push(caption);
    const after = structuredClone(before);
    const changed = after.composition.clips[0]!;
    if (changed.kind !== 'caption') throw new Error('Expected caption');
    if (operation === 'add') changed.transform = transform;
    else delete changed.transform;
    expect(describeChange(before, after)).toMatchObject({
      operation: 'edit',
      target: 'caption',
    });
  });

  it('distinguishes highlight effects from blur effects', () => {
    const before = screenshotSnapshot();
    const after = structuredClone(before);
    const highlight = historyClip('blur', 'highlight');
    if (highlight.kind !== 'blur') throw new Error('Expected blur');
    highlight.mode = 'highlight';
    after.effects = [highlight];
    expect(describeChange(before, after)).toMatchObject({
      operation: 'add',
      target: 'highlight',
    });
  });

  it.each(['shape', 'arrow', 'drawing'] as const)('identifies the %s element family', (family) => {
    const before = screenshotSnapshot();
    const after = structuredClone(before);
    const shape = historyClip('shape', 'shape');
    if (shape.kind !== 'shape') throw new Error('Expected shape');
    shape.family = family;
    delete shape.text;
    after.shapes = [shape];
    expect(describeChange(before, after)).toMatchObject({
      operation: 'add',
      target: family,
      name: undefined,
    });
  });

  it.each(['background', 'canvas', 'zoom'] as const)('describes video %s settings', (target) => {
    const before = videoSnapshot();
    const after = structuredClone(before);
    if (target === 'background') after.backgroundBlurPercent = 50;
    if (target === 'canvas') after.outputCanvas.width = 2000;
    if (target === 'zoom')
      after.zoomAutoFollow = {
        safeZone: 0.5,
        responsiveness: 0.5,
        directionLock: true,
      };
    expect(describeChange(before, after)).toMatchObject({
      operation: 'edit',
      target,
    });
  });

  it.each(['background', 'canvas', 'export'] as const)('describes screenshot %s settings', (target) => {
    const before = screenshotSnapshot();
    const after = structuredClone(before);
    if (target === 'background') after.blurPercent = 30;
    if (target === 'canvas') after.canvas.height = 2000;
    if (target === 'export') after.format = 'webp';
    expect(describeChange(before, after)).toMatchObject({
      operation: 'edit',
      target,
    });
  });

  it('describes zoom timing and focus independently', () => {
    const before = videoSnapshot();
    before.zoomElements.push({
      id: 'zoom-1',
      sessionId: 'session',
      startMs: 0,
      endMs: 1000,
      focus: { cx: 0.5, cy: 0.5 },
      depth: 1,
      mode: 'manual',
    });
    const after = structuredClone(before);
    after.zoomElements[0]!.endMs = 2000;
    expect(describeChange(before, after)).toMatchObject({
      operation: 'timing',
      target: 'zoom',
      name: '1',
    });
    after.zoomElements[0]!.endMs = 1000;
    after.zoomElements[0]!.focus.cx = 0.3;
    expect(describeChange(before, after)).toMatchObject({
      operation: 'move',
      target: 'zoom',
      name: '1',
    });
  });

  it.each(['add', 'move', 'resize'] as const)('describes cursor %s', (operation) => {
    const before = screenshotSnapshot();
    const cursor = {
      id: 'cursor',
      name: 'Cursor',
      enabled: true,
      position: { x: 0.1, y: 0.1 },
      size: 24,
      rotation: 0,
      selection: {
        packId: 'pack',
        mode: 'fixed' as const,
        cursorId: 'pointer',
      },
      color: '#ffffff',
      shadowEnabled: false,
      shadowBlur: 0,
      shadowColor: '#000000',
      shadowDirection: 'bottom' as const,
    };
    if (operation !== 'add') before.cursors = [cursor];
    const after = structuredClone(before);
    if (operation === 'add') after.cursors = [cursor];
    if (operation === 'move') after.cursors![0]!.position.x = 0.5;
    if (operation === 'resize') after.cursors![0]!.size = 30;
    expect(describeChange(before, after)).toMatchObject({
      operation,
      target: 'cursor',
    });
  });

  it('counts a multi-item operation without counting layer membership twice', () => {
    const before = screenshotSnapshot();
    const after = structuredClone(before);
    const a = historyClip('shape', 'a'),
      b = historyClip('shape', 'b');
    if (a.kind !== 'shape' || b.kind !== 'shape') throw new Error('Expected shapes');
    after.shapes = [a, b];
    after.composition!.push(
      ...[a, b].map(({ id }) => ({
        id,
        opacity: 100,
        blendMode: 'source-over' as const,
        locked: false,
      })),
    );
    expect(describeChange(before, after)).toEqual({
      operation: 'add',
      target: 'changes',
      count: 2,
    });
    expect(describeChange(after, before)).toEqual({
      operation: 'remove',
      target: 'changes',
      count: 2,
    });
  });

  it('describes imported screenshot images with their file names', () => {
    const before = screenshotSnapshot();
    const after = structuredClone(before);
    const clip = historyClip('image', 'imported');
    if (clip.kind !== 'image') throw new Error('Expected image');
    after.images = [{ ...clip, kind: 'image', source: 'demo.png', width: 100, height: 100 }];
    expect(describeChange(before, after)).toMatchObject({
      operation: 'add',
      target: 'image',
      name: 'demo.png',
    });
  });

  it('counts mixed settings edits as a single history action affecting multiple items', () => {
    const before = videoSnapshot();
    const after = structuredClone(before);
    after.outputCanvas.width = 1000;
    after.composition.clips.push(historyClip());
    expect(describeChange(before, after)).toEqual({
      operation: 'edit',
      target: 'changes',
      count: 2,
    });
  });

  it.each(['reorder', 'edit'] as const)('describes layer %s', (operation) => {
    const before = screenshotSnapshot();
    before.composition!.push({
      id: 'other',
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
    });
    const after = structuredClone(before);
    if (operation === 'reorder') after.composition!.reverse();
    else after.composition![0]!.opacity = 50;
    expect(describeChange(before, after)).toMatchObject({
      operation,
      target: 'layers',
    });
  });

  it('retains layer property changes that accompany an element edit', () => {
    const before = screenshotSnapshot();
    const after = structuredClone(before);
    after.image.enabled = false;
    after.composition![0]!.opacity = 50;
    expect(describeChange(before, after)).toEqual({
      operation: 'edit',
      target: 'changes',
      count: 2,
    });
  });

  it('describes initial layer setup without assuming previous composition metadata', () => {
    const before = screenshotSnapshot();
    delete before.composition;
    const after = screenshotSnapshot();
    expect(describeChange(before, after)).toMatchObject({
      operation: 'edit',
      target: 'layers',
    });
  });

  it.each([{}, { value: 1 }, { value: 2 }])('handles generic and unchanged snapshots', (before) => {
    expect(describeChange(before, { value: 2 })).toMatchObject({
      target: 'changes',
    });
  });
});
