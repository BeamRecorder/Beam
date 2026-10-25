import type { Ref } from 'vue';
import type { Clip, ClipComposition } from '@beam/engine/shared/composition-types';
import { clipEndMs } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { splitRecordingClip } from '@beam/engine/composition/recording-split';

export function useRecordingClipSplit(
  composition: Ref<ClipComposition>,
  zooms: Ref<ZoomElement[]>,
  selectedClip: Ref<Clip | null | undefined>,
  currentTime: Ref<number>,
) {
  return () => {
    const clip = selectedClip.value;
    const timeMs = Math.round(currentTime.value * 1000);
    if (!clip || timeMs <= clip.timelineStartMs || timeMs >= clipEndMs(clip)) return;
    const result = splitRecordingClip(composition.value, zooms.value, clip.id, timeMs);
    composition.value = result.composition;
    zooms.value = result.zoomElements;
  };
}
