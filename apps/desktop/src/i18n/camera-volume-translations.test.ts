import { expect, it } from 'vitest';
const editors = import.meta.glob('./*/editor.json', { eager: true, import: 'default' }) as Record<
  string,
  { ZoomPanel: Record<string, string> }
>;
const cores = import.meta.glob('./*/core.json', { eager: true, import: 'default' }) as Record<
  string,
  { CursorPanel: Record<string, string> }
>;
it('translates every camera and cursor volume control in fifteen languages', () => {
  expect(Object.keys(editors)).toHaveLength(15);
  expect(Object.keys(cores)).toHaveLength(15);
  for (const catalog of Object.values(editors))
    for (const key of [
      'orbit',
      'orbitDescription',
      'orbitIntensity',
      'camera3dDescription',
      'cameraPresets',
      'cameraIntensity',
      'orbitSubtle',
      'orbitBalanced',
      'orbitDynamic',
      'orbitIsometric',
      'orbitLeft',
      'orbitRight',
      'orbitPullback',
      'orbitPullbackLarge',
      'cameraYaw',
      'cameraPitch',
      'cameraRoll',
      'cameraPullback',
      'cameraFieldOfView',
      'cameraDolly',
      'cameraHorizontal',
      'cameraVertical',
      'cameraResponseMs',
      'cameraLeadMs',
      'cameraFollowHint',
      'cameraManualHint',
    ])
      expect(catalog.ZoomPanel[key]!.length).toBeGreaterThan(0);
  for (const catalog of Object.values(cores))
    for (const key of ['model3d', 'model3dDescription']) expect(catalog.CursorPanel[key]!.length).toBeGreaterThan(3);
  expect(new Set(Object.values(editors).map((c) => c.ZoomPanel.orbitDescription)).size).toBe(15);
  expect(new Set(Object.values(cores).map((c) => c.CursorPanel.model3dDescription)).size).toBe(15);
});
