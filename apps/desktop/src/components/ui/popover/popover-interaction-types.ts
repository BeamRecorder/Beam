import type { InjectionKey, Ref } from 'vue';

export type HoldPopoverInteraction = () => () => void;
export const holdPopoverInteractionKey: InjectionKey<HoldPopoverInteraction> = Symbol('popover-external-interaction');

export const popoverOpenStateKey: InjectionKey<(id: string, open: boolean) => void> = Symbol('popover-open-state');
export const popoverVisibilityKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol('popover-visibility');
