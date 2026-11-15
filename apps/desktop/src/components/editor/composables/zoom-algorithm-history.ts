import type { useProjectZoom } from './useProjectZoom';

/** Record the mode and regenerated shots as one discrete edit, without rerunning generation on undo. */
export function bindZoomAlgorithmHistory(
  zoom: Pick<ReturnType<typeof useProjectZoom>, 'updateZoomAutoFollow' | 'zoomAutoFollow'>,
  commit: () => void,
  available: () => boolean,
) {
  const update = zoom.updateZoomAutoFollow;
  zoom.updateZoomAutoFollow = (value) => {
    const changed = Boolean(value.experimentalZoom) !== Boolean(zoom.zoomAutoFollow.value.experimentalZoom);
    if (changed && !available()) return;
    if (changed) commit();
    update(value);
    if (changed) commit();
  };
}
