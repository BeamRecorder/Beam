import { computed } from 'vue';
import type { CursorPropertyScope } from './cursor-property-types';
import type { CursorPresentationSettings } from '@beam/engine/capture/cursor-presentation';

export function useCursorPropertyFields(scope: CursorPropertyScope) {
  const field = <K extends keyof CursorPresentationSettings>(key: K) =>
    computed({
      get: () => scope.settings.value[key],
      set: (value: CursorPresentationSettings[K]) => scope.update({ ...scope.settings.value, [key]: value }),
    });
  const shadow = <K extends keyof CursorPresentationSettings['shadow']>(key: K) =>
    computed({
      get: () => scope.settings.value.shadow[key],
      set: (value: CursorPresentationSettings['shadow'][K]) =>
        scope.update({
          ...scope.settings.value,
          shadow: { ...scope.settings.value.shadow, [key]: value },
        }),
    });
  return {
    cursorSelection: field('selection'),
    cursorSize: field('size'),
    cursorColor: field('color'),
    enableShadow: shadow('enabled'),
    shadowBlur: shadow('blur'),
    shadowColor: shadow('color'),
    shadowDirection: shadow('direction'),
    clickEffects: field('clickEffects'),
    cursorMotion: field('motion'),
    cursorAutoHide: field('autoHide'),
  };
}
