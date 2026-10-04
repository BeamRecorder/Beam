import { prepareTimingPreview } from '../../composition/timing-preview';
import { compileSceneComposition } from '../scene-clock';
import { expect, it } from 'vitest';
import { createDefaultClipAppearance } from '../../shared/composition-defaults';
import { createCompositionScreenResolver, resolveCompositionSceneLayers } from '../../composition/scene-layers';
import type { VisualClip } from '../../shared/composition-types';
import { colorClip, group, sceneDocument } from './scene-fixtures';

const screen = (id = 'a', order = 0): VisualClip => ({
  ...colorClip(id, 0, order),
  kind: 'screen',
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
});
it('evaluates a visibility track even when its authored clip is hidden', () => {
  const doc = sceneDocument();
  doc.clips[0]!.enabled = false;
  doc.animations!.tracks = [
    {
      id: 'visibility',
      targetId: 'a',
      property: 'enabled',
      interpolation: 'discrete',
      keyframes: [
        { timeMs: 0, value: false },
        { timeMs: 500, value: true },
      ],
    },
  ];
  expect(resolveCompositionSceneLayers(doc, 0).visualStack).toHaveLength(0);
  expect(resolveCompositionSceneLayers(doc, 500).visualStack).toHaveLength(1);
  expect(resolveCompositionSceneLayers(doc, 1000).visualStack).toHaveLength(0);
});
it('selects the foremost screen from hierarchy order for camera and rendering alike', () => {
  const doc = { ...sceneDocument(), clips: [screen('a', 10), screen('b', 0)] };
  doc.scene!.groups[0]!.children = ['a', 'b'];
  delete doc.animations;
  expect(resolveCompositionSceneLayers(doc, 500).screen?.id).toBe('b');
  expect(createCompositionScreenResolver(doc)(500)?.id).toBe('b');
});
it('samples local screen animation after nested timing compilation on reverse seeks', () => {
  const doc = { ...sceneDocument(), clips: [screen()] };
  doc.clips[0]!.timelineStartMs = 200;
  doc.scene!.groups = [{ ...group(), timing: { startMs: 1000, rate: 2 } }];
  doc.animations!.tracks[0]!.timeSpace = 'local';
  const resolve = createCompositionScreenResolver(doc);
  expect(resolve(1350)?.transform.x).toBe(0.5);
  expect(resolve(1100)?.transform.x).toBe(0);
  expect(resolve(1350)?.timelineStartMs).toBe(1100);
  expect(resolveCompositionSceneLayers(compileSceneComposition(doc), 1350).screen?.transform.x).toBe(0.5);
  expect(doc.clips[0]!.transform.x).toBe(0);
});

it('samples local animation in a sparse gesture without materializing the document', () => {
  const doc = { ...sceneDocument(), clips: [screen()] };
  delete doc.scene;
  doc.animations!.tracks[0]!.timeSpace = 'local';
  const preview = prepareTimingPreview(doc, new Set(['a']))([{ ...doc.clips[0]!, timelineStartMs: 200 }]);
  Object.defineProperty(preview, 'clips', {
    get() {
      throw new Error('Full snapshot requested');
    },
  });
  expect(resolveCompositionSceneLayers(preview, 700).screen?.transform.x).toBe(0.5);
  expect(createCompositionScreenResolver(preview)(700)?.transform.x).toBe(0.5);
});
