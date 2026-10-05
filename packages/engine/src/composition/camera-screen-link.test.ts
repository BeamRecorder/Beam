import { describe, expect, it } from 'vitest';
import { createComposition } from '../commands/clip-engine';
import { createDefaultClipAppearance } from '../shared/composition-defaults';
import type { MediaAsset, VisualClip } from '../shared/composition-types';
import { cameraScreenCanShareGroup, cameraScreenPartner } from './camera-screen-link';
const asset: MediaAsset = {
  id: 'screen-asset',
  kind: 'video',
  name: 'Screen',
  fileName: null,
  src: 'screen.mp4',
  width: 1920,
  height: 1080,
  durationMs: 1000,
  origin: 'session',
  sessionId: 'session',
};
const screen: VisualClip = {
  id: 'screen',
  kind: 'screen',
  name: 'Screen',
  assetId: asset.id,
  trackId: 'screen',
  timelineStartMs: 0,
  timelineDurationMs: 1000,
  sourceInMs: 0,
  sourceDurationMs: 1000,
  playbackRate: 1,
  transitions: { entry: null, exit: null },
  enabled: true,
  order: 0,
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance('screen'),
  isMirrored: false,
  isMirroredY: false,
};
const camera: VisualClip = { ...screen, id: 'camera', kind: 'webcam', assetId: 'camera-asset', trackId: 'camera' };
const composition = (
  patch: Partial<VisualClip> = {},
  cameraAsset: Partial<MediaAsset> = {},
  extra: VisualClip[] = [],
) =>
  createComposition(
    [asset, { ...asset, id: 'camera-asset', ...cameraAsset }],
    [screen, { ...camera, ...patch }, ...extra],
  );

describe('camera recording partners', () => {
  it.each([{ timelineStartMs: 1 }, { timelineDurationMs: 500 }, { playbackRate: 2 }])(
    'requires matching group timing: %j',
    (patch) => {
      expect(cameraScreenCanShareGroup(screen, screen)).toBe(true);
      expect(cameraScreenCanShareGroup(screen, { ...screen, ...patch })).toBe(false);
    },
  );
  it('resolves existing groups without inferring session partners unless requested', () => {
    const grouped = createComposition(
      [asset, { ...asset, id: 'camera-asset' }],
      [
        { ...screen, groupId: 'group' },
        { ...camera, groupId: 'group' },
      ],
    );
    const cam = grouped.clips.find((clip): clip is VisualClip => clip.kind === 'webcam')!;
    expect(cameraScreenPartner(grouped, cam)?.id).toBe(screen.id);
    expect(cameraScreenPartner(composition(), camera)).toBeUndefined();
    expect(cameraScreenPartner(composition(), camera, true)?.id).toBe(screen.id);
  });
  it('honors explicit project-owned recording links and explicit detachment', () => {
    const attached = composition({ recordingClipId: screen.id }, { origin: 'project' });
    const cam = attached.clips.find((clip): clip is VisualClip => clip.kind === 'webcam')!;
    expect(cameraScreenPartner(attached, cam)?.id).toBe(screen.id);
    expect(cameraScreenPartner(attached, { ...cam, recordingClipId: null }, true)).toBeUndefined();
    expect(cameraScreenPartner(attached, screen, true)).toBeUndefined();
    expect(cameraScreenPartner(attached, { ...cam, recordingClipId: 'missing' }, true)).toBeUndefined();
  });
  it.each([{ origin: 'project' as const }, { sessionId: undefined }, { sessionId: 'another' }])(
    'rejects incompatible source identity: %j',
    (patch) => {
      expect(cameraScreenPartner(composition({}, patch), camera, true)).toBeUndefined();
    },
  );
  it('rejects ambiguous, non-overlapping and conflicting groups', () => {
    expect(
      cameraScreenPartner(composition({}, {}, [{ ...screen, id: 'other', trackId: 'other' }]), camera, true),
    ).toBeUndefined();
    expect(cameraScreenPartner(composition(), { ...camera, timelineStartMs: 1000 }, true)).toBeUndefined();
    const grouped = composition({ groupId: 'camera-group' });
    const screenGroup = {
      ...grouped,
      clips: grouped.clips.map((clip) => (clip.id === screen.id ? { ...clip, groupId: 'screen-group' } : clip)),
    };
    expect(cameraScreenPartner(screenGroup, { ...camera, groupId: 'camera-group' }, true)).toBeUndefined();
    expect(cameraScreenPartner(createComposition(), camera, true)).toBeUndefined();
  });
});
