// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateSceneExtensions } from '../scene-schema.js';
import { compileSceneComposition, sceneClocks } from '../scene-clock';
import { createCompositionSceneLayerResolver } from '../../composition/scene-layers';
import { compositionDurationMs, sourceTimeAt } from '../../shared/timeline-mapping';
import { createSceneAnimator } from '../scene-animation';
import { propertyPath, readProperty, writeProperty } from '../property-path';
import { animation, colorClip, group, sceneDocument } from './scene-fixtures';
import { createCompositionCommands } from '../../commands/composition-commands';
import { createDocumentSession } from '../../document/document-session';
import { validateComposition } from '../../commands/clip-composition-validation';
import { deleteClip, moveClip, splitClip, updateClip } from '../../commands/clip-engine';

describe('nested scene clocks and animation ownership', () => {
  it('preserves old flat documents and caches compiled world intervals', () => {
    const doc = { schemaVersion: 14, assets: [], keyboardCaptionSessions: [], clips: [colorClip()] };
    expect(compileSceneComposition(doc)).toBe(doc);
    expect(sceneClocks(doc).size).toBe(0);
    const nested = sceneDocument(),
      compiled = compileSceneComposition(nested);
    expect(compileSceneComposition(nested)).toBe(compiled);
    expect(compileSceneComposition(compiled)).toBe(compiled);
    expect(compiled.clips[0]).toBe(nested.clips[0]);
    expect(sceneClocks(nested)).toBe(sceneClocks(nested));
  });
  it('composes offsets and rates with identical source times at boundaries', () => {
    const doc = sceneDocument();
    doc.scene!.groups = [
      { ...group('outer', ['g']), timing: { startMs: 1000, rate: 2 } },
      { ...group(), timing: { startMs: 400, rate: 2 } },
    ];
    doc.scene!.roots = ['outer'];
    doc.clips[0]!.transitions!.entry = { durationMs: 200, preset: { kind: 'fade' } };
    const world = compileSceneComposition(doc),
      clip = world.clips[0]!;
    expect(clip.timelineStartMs).toBe(1200);
    expect(clip.timelineDurationMs).toBe(250);
    expect(clip.playbackRate).toBe(4);
    expect(clip.transitions!.entry!.durationMs).toBe(50);
    expect(compositionDurationMs(doc)).toBe(1450);
    expect(sourceTimeAt(clip, 1250)).toBe(200);
    expect(sourceTimeAt(clip, 1450)).toBeNull();
    expect(doc.clips[0]!.timelineStartMs).toBe(0);
    const resolve = createCompositionSceneLayerResolver(doc);
    expect(resolve(1199).visualStack).toHaveLength(0);
    expect(resolve(1200).visualStack).toHaveLength(1);
    expect(resolve(1450).visualStack).toHaveLength(0);
  });
  it('samples local clip and group tracks without modifying author data', () => {
    const doc = sceneDocument();
    doc.scene!.groups[0]!.timing = { startMs: 1000, rate: 2 };
    doc.animations!.tracks[0]!.timeSpace = 'local';
    doc.animations!.tracks.push({
      ...animation(),
      id: 'group-track',
      targetId: 'g',
      property: 'opacity',
      timeSpace: 'local',
    });
    const resolve = createCompositionSceneLayerResolver(doc);
    expect(resolve(1250).visualStack[0]!.transform.x).toBe(0.5);
    expect(resolve(1250).scene!.groups[0]!.opacity).toBe(0.5);
    expect(resolve(1100).visualStack[0]!.transform.x).toBe(0.2);
    expect(doc.clips[0]!.transform.x).toBe(0);
    expect(doc.scene!.groups[0]!.opacity).toBe(1);
    const unchanged = colorClip('other');
    expect(createSceneAnimator(doc)(unchanged, 2000)).toBe(unchanged);
  });
  it('owns immutable snapshots and shares unchanged records across edits and undo', async () => {
    const doc = sceneDocument();
    doc.clips.push(colorClip('b', 0, 1));
    const session = createDocumentSession(doc, {
      commands: createCompositionCommands(),
      validate: validateComposition,
    });
    const initial = session.document;
    expect(() => {
      initial.clips[0]!.name = 'mutated';
    }).toThrow();
    session.execute({ type: 'clip.move', payload: { clipId: 'a', startMs: 200 } });
    expect(session.document.clips[1]).toBe(initial.clips[1]);
    expect(session.document.assets[0]).toBe(initial.assets[0]);
    await session.undo();
    expect(session.document).toBe(initial);
    await session.redo();
    expect(session.document.clips[0]!.timelineStartMs).toBe(200);
  });
  it('keeps split children in their scene and removes deleted references and tracks', () => {
    const doc = sceneDocument();
    const split = splitClip(doc, 'a', 500, () => 'right');
    expect(split.scene!.groups[0]!.children).toEqual(['a', 'right']);
    const deleted = deleteClip(split, 'a');
    expect(deleted.scene!.groups[0]!.children).toEqual(['right']);
    expect(deleted.animations!.tracks.map((track) => track.targetId)).toEqual(['right']);
    expect(doc.scene!.groups[0]!.children).toEqual(['a']);
    validateComposition(deleted);
  });
  it('owns callback targets so a mutating external updater cannot alter the previous state', () => {
    const doc = sceneDocument();
    const next = updateClip(doc, 'a', (clip) => {
      clip.name = 'changed';
      return clip;
    });
    expect(doc.clips[0]!.name).toBe('a');
    expect(next.clips[0]!.name).toBe('changed');
    const moved = moveClip(doc, 'a', 200);
    expect(doc.clips[0]!.timelineStartMs).toBe(0);
    expect(moved.clips[0]!.timelineStartMs).toBe(200);
  });
  it('safely reads and writes declared nested properties', () => {
    const target = { transform: { x: 1 } };
    const path = propertyPath('transform.x');
    expect(readProperty(target, path)).toBe(1);
    expect(writeProperty(target, path, 2)).toEqual({ transform: { x: 2 } });
    expect(target.transform.x).toBe(1);
    for (const path of ['__proto__.polluted', 'constructor.foo', 'id', '', 'a.b.c.d.e.f.g.h.i'])
      expect(() => propertyPath(path)).toThrow();
    expect(() => readProperty(target, ['missing'])).toThrow('Unknown');
    expect(() => writeProperty(target, [], 1)).toThrow('Empty');
  });
});

describe('untrusted scene and keyframe schema', () => {
  it('accepts empty scenes and all supported keyframe codecs and easing contracts', () => {
    const doc = sceneDocument();
    validateSceneExtensions(doc);
    for (const easing of [
      'linear',
      'ease-in',
      'ease-out',
      'ease-in-out',
      { bezier: [0, 0, 1, 1] },
      { steps: 2, position: 'start' },
      { spring: { damping: 8, frequency: 12 } },
    ]) {
      doc.animations!.tracks[0]!.keyframes[0]!.easing = easing as never;
      validateSceneExtensions(doc);
    }
    for (const track of [
      {
        ...animation(),
        property: 'fill.color',
        interpolation: 'color',
        keyframes: [{ timeMs: 0, value: '#abcdef80' }],
      },
      { ...animation(), property: 'enabled', interpolation: 'discrete', keyframes: [{ timeMs: 0, value: false }] },
    ]) {
      doc.animations!.tracks = [track as never];
      validateSceneExtensions(doc);
    }
    doc.animations = { version: 1, tracks: [] };
    doc.scene = { version: 1, roots: [], groups: [] };
    validateSceneExtensions(doc);
  });
  it.each([
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups[0]!.timing = null as never;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups[0]!.mask = null as never;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups[0]!.properties = null as never;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks[0]!.timeOffsetMs = Infinity;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups[0]!.properties = { invalid: {} as never };
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks[0] = {
        ...animation(),
        property: 'enabled',
        interpolation: 'discrete',
        keyframes: [{ timeMs: 0, value: 'yes' }],
      };
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.version = 2 as never;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.roots = ['missing'];
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.roots = ['g', 'g'];
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups[0]!.children = ['g'];
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups.push(group());
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups[0]!.opacity = 2;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups[0]!.transform.scaleX = 0;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups[0]!.timing = { startMs: -1, rate: 1 };
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups[0]!.mask = { shape: 'ellipse', x: 0, y: 0, width: 0, height: 1 };
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.roots = [];
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.scene!.groups[0]!.space = 'overlay';
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.version = 2 as never;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks[0]!.property = '__proto__.polluted';
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks[0]!.property = 'missing';
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks[0]!.targetId = 'missing';
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks[0]!.keyframes = [];
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks[0]!.keyframes[1]!.timeMs = 0;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks[0]!.keyframes[0]!.value = NaN;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks.push({ ...animation(), id: 'other' });
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks[0]!.keyframes[0]!.easing = 'unknown' as never;
    },
    (doc: ReturnType<typeof sceneDocument>) => {
      doc.animations!.tracks[0]!.keyframes[0]!.easing = { steps: 0, position: 'end' };
    },
  ])('rejects malformed documents before publication', (mutate) => {
    const doc = sceneDocument();
    mutate(doc);
    expect(() => validateSceneExtensions(doc)).toThrow('Invalid scene');
  });
});
