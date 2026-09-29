import { expect, it } from 'vitest';
import { clipLabel, trackLayout } from './trackLayout';
import { defaultEffects, defaultTitle } from '../shared/defaults';
import type { Project, Clip } from '../shared/editorTypes';
const clip: Clip = { id: 'clip', assetId: 'asset', trackId: 'video', startMs: 0, sourceInMs: 0, durationMs: 1000, effects: defaultEffects };
const project: Project = { id: 'p', name: 'Test', assets: [], tracks: [{ id: 'video', kind: 'video', name: 'Video', hidden: false, muted: false }, { id: 'audio', kind: 'audio', name: 'Audio', hidden: false, muted: false }], clips: [clip], canvas: { width: 1920, height: 1080, fps: 30, background: 0 }, warnings: [] };
it('uses consistent row offsets and different video/audio heights', () => {
  expect(trackLayout(project).map(({ y, height }) => [y, height])).toEqual([[28, 102], [130, 54]]);
});
it('keeps title rows compact and mixed video rows large', () => {
  const title = { ...clip, title: defaultTitle };
  expect(trackLayout({ ...project, clips: [title] })[0].height).toBe(44);
  expect(trackLayout({ ...project, clips: [title, clip] })[0].height).toBe(102);
});
it('handles empty projects and real text or missing source labels', () => {
  expect(trackLayout()).toEqual([]); expect(trackLayout({ ...project, tracks: [] })).toEqual([]);
  expect(clipLabel({ ...clip, title: defaultTitle }, project)).toBe('Title');
  expect(clipLabel(clip, project)).toBe('');
});
