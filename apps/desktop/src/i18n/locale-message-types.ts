export type CoreMessages = typeof import('./en/core.json');
export type EditorMessages = typeof import('./en/editor.json');
export type LocaleMessages = CoreMessages & EditorMessages;
export type MessageLoaders<T> = Record<string, () => Promise<T>>;
