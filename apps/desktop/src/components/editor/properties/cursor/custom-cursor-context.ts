import type { InjectionKey, Ref } from 'vue';
import type { ScreenCursorVisibilityContext } from './screen-cursor-visibility-types';
export const customCursorKey: InjectionKey<Ref<boolean>> = Symbol('custom-cursor-enabled');
export const screenCursorSelectionKey: InjectionKey<ScreenCursorVisibilityContext> = Symbol('screen-cursor-selection');
