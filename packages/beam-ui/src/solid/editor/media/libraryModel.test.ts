import { expect, it } from 'vitest';
import { insertion, mediaFor, presetEffects } from './libraryModel';
import { defaultEffects } from '../shared/defaults';
import type { Asset, Clip, Project } from '../shared/editorTypes';
const video: Asset = { id: 'v', name: 'Screen.webm', durationMs: 1000, width: 1920, height: 1080, hasVideo: true, hasAudio: true, hasCursor: true, zoomCount: 2, recording: true };
const audio: Asset = { ...video, id: 'a', name: 'Voice.wav', hasVideo: false, recording: false };
const image: Asset = { ...video, id: 'i', name: 'Still.png', isImage: true, hasAudio: false, recording: false };
const clip: Clip = { id: 'c', assetId: 'v', trackId: 'video', startMs: 2000, sourceInMs: 0, durationMs: 1000, effects: defaultEffects };
const project: Project = { id: 'p', name: 'Project', canvas: { width: 1920, height: 1080, fps: 30, background: 0 }, assets: [video, audio, image], tracks: [{ id: 'video', name: 'Video', kind: 'video', muted: false, hidden: false }, { id: 'audio', name: 'Audio', kind: 'audio', muted: false, hidden: false }], clips: [clip], warnings: [] };
it.each([['all', [video, audio, image]], ['video', [video]], ['audio', [audio]], ['images', [image]], ['recordings', [video]]] as const)('filters actual metadata for %s', (filter, expected) => expect(mediaFor(project.assets, filter)).toEqual(expected));
it('handles empty and case insensitive source searches', () => {
  expect(mediaFor([], 'all')).toEqual([]); expect(mediaFor(project.assets, 'all', 'SCREEN')).toEqual([video]);
  expect(mediaFor(project.assets, 'images', 'Screen')).toEqual([]);
});
it('appends to a compatible lane without overlapping existing clips', () => {
  expect(insertion(project, video)).toEqual({ trackId: 'video', startMs: 3000 });
  expect(insertion(project, audio)).toEqual({ trackId: 'audio', startMs: 0 });
  expect(insertion({ ...project, tracks: [] }, image)).toBeUndefined();
});
it('fits fades to very short clips and preserves unrelated camera and color controls', () => {
  const effects = presetEffects({ ...clip, durationMs: 250 }, { fadeInMs: 500, fadeOutMs: 500 });
  expect(effects.fadeInMs).toBe(250); expect(effects.fadeOutMs).toBe(0); expect(effects.autoZoom).toBe(true);
  expect(presetEffects(clip, { saturation: 0 }).opacity).toBe(1);
  expect(presetEffects(clip, { fadeInMs: -1, fadeOutMs: -1 }).fadeInMs).toBe(0);
});
