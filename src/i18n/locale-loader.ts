import type { AppLocale } from './types';
import type { CoreMessages, EditorMessages, LocaleMessages, MessageLoaders } from './locale-message-types';

export const createLocaleLoader = (
  core: MessageLoaders<CoreMessages>,
  editor: MessageLoaders<EditorMessages>,
  english: LocaleMessages,
) => {
  const pending = new Map<AppLocale, Promise<LocaleMessages>>();
  const loaded = new Map<AppLocale, LocaleMessages>([['en', english]]);
  return (locale: AppLocale): Promise<LocaleMessages> => {
    const messages = loaded.get(locale);
    if (messages) return Promise.resolve(messages);
    const inFlight = pending.get(locale);
    if (inFlight) return inFlight;
    const loadCore = core[`./${locale}/core.json`];
    const loadEditor = editor[`./${locale}/editor.json`];
    if (!loadCore || !loadEditor) return Promise.reject(new Error(`Translations unavailable for ${locale}`));
    const request = Promise.all([loadCore(), loadEditor()])
      .then(([coreMessages, editorMessages]) => {
        const messages = { ...coreMessages, ...editorMessages };
        loaded.set(locale, messages);
        return messages;
      })
      .finally(() => pending.delete(locale));
    pending.set(locale, request);
    return request;
  };
};
