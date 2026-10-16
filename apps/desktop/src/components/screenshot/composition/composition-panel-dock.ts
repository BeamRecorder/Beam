import { inject, provide, ref, type InjectionKey } from 'vue';
import { usePreferencesStore } from '~/stores/preferences';
import type { CompositionPanelDock } from './composition-panel-types';

export const COMPOSITION_DOCK_KEY = 'screenshotCompositionDocked';
const dockKey: InjectionKey<CompositionPanelDock> = Symbol('screenshot-composition-dock');

export function provideCompositionPanelDock() {
  const preferences = usePreferencesStore();
  const dock: CompositionPanelDock = {
    target: ref(null),
    count: ref(0),
    docked: ref(preferences.settings?.extras?.[COMPOSITION_DOCK_KEY] === true),
    expanded: ref(false),
    dragging: ref(false),
    hovered: ref(false),
  };
  provide(dockKey, dock);
  return dock;
}

export const useCompositionPanelDock = () => inject(dockKey, null);
