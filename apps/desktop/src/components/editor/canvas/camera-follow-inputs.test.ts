import { expect, it } from 'vitest';
import { DEFAULT_ZOOM_AUTO_FOLLOW } from '@beam/engine/zoom/zoom-types';
import { cameraFollowInputs } from './camera-follow-inputs';

it('gives absent legacy follow the enabled identity', () => {
  expect(cameraFollowInputs()[0]).toBe(true);
  expect(cameraFollowInputs({ safeZone: 0.5, responsiveness: 0.55, directionLock: true })).toEqual(
    cameraFollowInputs(DEFAULT_ZOOM_AUTO_FOLLOW),
  );
});
it('invalidates for each independent follow setting', () => {
  const original = cameraFollowInputs(DEFAULT_ZOOM_AUTO_FOLLOW);
  for (const patch of [{ enabled: false }, { safeZone: 0.7 }, { responsiveness: 0.3 }, { directionLock: false }]) {
    expect(cameraFollowInputs({ ...DEFAULT_ZOOM_AUTO_FOLLOW, ...patch })).not.toEqual(original);
  }
});
it('captures primitive values independently of later reactive mutations', () => {
  const settings = { ...DEFAULT_ZOOM_AUTO_FOLLOW },
    original = cameraFollowInputs(settings);
  settings.enabled = false;
  expect(original[0]).toBe(true);
  expect(cameraFollowInputs(settings)[0]).toBe(false);
});
