import type { PreferenceShortcut } from '~/api/types/preferences';
export type ActionContext = 'global' | 'video' | 'screenshot' | 'hud' | 'quick-snip';
export type ActionGroup =
  | 'recording'
  | 'teleprompter'
  | 'editing'
  | 'timeline'
  | 'tools'
  | 'view'
  | 'gestures'
  | 'properties';
export interface ActionDefinition {
  id: string;
  keys: string;
  aliases?: readonly string[];
  group: ActionGroup;
  label: string;
  contexts: readonly ActionContext[];
  kind: 'keyboard' | 'modifier';
  scope: 'application' | 'global';
}
export type ActionBindings = Record<string, PreferenceShortcut>;
export interface ShortcutSection {
  id: string;
  label: string;
  group: ActionGroup;
  actions: ActionDefinition[];
}
export interface ShortcutReassignment {
  action: ActionDefinition;
  keys: string;
  conflicts: readonly ActionDefinition[];
}
export interface ModifierState {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export interface ShortcutAction {
  id: string;
  disabled?: boolean;
  run: () => void | Promise<unknown>;
}
export interface CaptureActionShortcutOptions {
  mode: import('vue').Ref<import('@beam/engine/capture/capture-mode').CaptureMode>;
  disabled: () => boolean;
  instant?: boolean;
  choose: (target: 'screen' | 'region' | 'window') => void | Promise<unknown>;
  settings?: () => void | Promise<unknown>;
  confirm?: () => void | Promise<unknown>;
  fail?: (reason: unknown) => void;
}
