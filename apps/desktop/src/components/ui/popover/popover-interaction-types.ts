import type { InjectionKey } from 'vue';

export type HoldPopoverInteraction = () => () => void;
export const holdPopoverInteractionKey: InjectionKey<HoldPopoverInteraction> = Symbol('popover-external-interaction');
