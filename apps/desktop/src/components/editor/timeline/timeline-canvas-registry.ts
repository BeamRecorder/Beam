import { onScopeDispose, provide, shallowRef } from 'vue';
import { TimelineArtworkImages } from './timeline-artwork-images';
import type { TimelineCanvasRegistry, TimelineCanvasRegistryKey } from './timeline-canvas-types';
import type { TimelineCanvasArtwork } from '@beam/runtime/timeline/timeline-canvas-types';

export const timelineCanvasRegistryKey: TimelineCanvasRegistryKey = Symbol('timeline-canvas-artwork');
export function useTimelineCanvasRegistry(): TimelineCanvasRegistry {
  const images = new TimelineArtworkImages();
  const map = new Map<string, TimelineCanvasArtwork>();
  const artworks = shallowRef<ReadonlyMap<string, TimelineCanvasArtwork>>(new Map());
  const registry: TimelineCanvasRegistry = {
    artworks,
    images,
    set: (id, value) => {
      map.set(id, value);
      artworks.value = new Map(map);
    },
    delete: (id) => {
      if (map.delete(id)) artworks.value = new Map(map);
    },
  };
  provide(timelineCanvasRegistryKey, registry);
  onScopeDispose(() => {
    images.dispose();
    map.clear();
    artworks.value = new Map();
  });
  return registry;
}
