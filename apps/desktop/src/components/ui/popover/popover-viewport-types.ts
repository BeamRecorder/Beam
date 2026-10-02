import type { InjectionKey } from 'vue';

export type PopoverViewport = (id: string, requiredBottom: number | null) => Promise<void>;
export const popoverViewportKey: InjectionKey<PopoverViewport> = Symbol('popover-viewport');
export const popoverAnchorConstraintKey: InjectionKey<boolean> = Symbol('popover-fit-anchor');
