import type * as CoreJsonModule from './en/core.json';
import type * as EditorJsonModule from './en/editor.json';
export type CoreMessages = typeof CoreJsonModule;
export type EditorMessages = typeof EditorJsonModule;
export type LocaleMessages = CoreMessages & EditorMessages;
export type MessageLoaders<T> = Record<string, () => Promise<T>>;
