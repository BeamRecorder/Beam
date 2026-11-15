import { expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { bindZoomAlgorithmHistory } from '../zoom-algorithm-history';
import { DEFAULT_ZOOM_AUTO_FOLLOW } from '@beam/engine/zoom/zoom-types';
import { createSnapshotHistory } from '@beam/engine/history/snapshot-history';
import type { ZoomAutoFollowSettings } from '@beam/engine/zoom/zoom-types';

it('records the mode and all regenerated shots together and restores without running generation', async () => {
  let shots = ['original'],
    settings: ZoomAutoFollowSettings = { ...DEFAULT_ZOOM_AUTO_FOLLOW };
  const generate = vi.fn((value: ZoomAutoFollowSettings) => {
    model.zoomAutoFollow.value = value;
    shots = [value.experimentalZoom ? 'regenerated' : 'original'];
  });
  const model = { zoomAutoFollow: ref(settings), updateZoomAutoFollow: generate };
  const history = createSnapshotHistory({
    onRestoreSnapshot: (state: { shots: string[]; settings: ZoomAutoFollowSettings }) => {
      shots = state.shots;
      settings = state.settings;
      model.zoomAutoFollow.value = settings;
    },
  });
  const commit = () => history.record({ shots: [...shots], settings: { ...model.zoomAutoFollow.value } });
  commit();
  bindZoomAlgorithmHistory(model, commit, () => true);
  model.updateZoomAutoFollow({ ...settings, experimentalZoom: true });
  expect(shots).toEqual(['regenerated']);
  expect(history.state.undo).toHaveLength(2);
  await history.undo();
  expect(shots).toEqual(['original']);
  expect(settings.experimentalZoom).toBeUndefined();
  await history.redo();
  expect(shots).toEqual(['regenerated']);
  expect(settings.experimentalZoom).toBe(true);
  expect(generate).toHaveBeenCalledOnce();
});
it('does not record discrete algorithm steps for ordinary tuning edits', () => {
  const commit = vi.fn(),
    update = vi.fn();
  const model = { zoomAutoFollow: ref({ ...DEFAULT_ZOOM_AUTO_FOLLOW }), updateZoomAutoFollow: update };
  bindZoomAlgorithmHistory(model, commit, () => true);
  model.updateZoomAutoFollow({ ...DEFAULT_ZOOM_AUTO_FOLLOW, safeZone: 0.6 });
  expect(commit).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledOnce();
});
it('blocks algorithm switching until history is ready or while restoring', () => {
  const commit = vi.fn(),
    update = vi.fn();
  const model = { zoomAutoFollow: ref({ ...DEFAULT_ZOOM_AUTO_FOLLOW }), updateZoomAutoFollow: update };
  bindZoomAlgorithmHistory(model, commit, () => false);
  model.updateZoomAutoFollow({ ...DEFAULT_ZOOM_AUTO_FOLLOW, experimentalZoom: true });
  expect(commit).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
