import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './locales';

const files = import.meta.glob('./*/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, Record<string, string>>
>;
const messagesFor = (locale: string) => ({ ...files[`./${locale}/core.json`], ...files[`./${locale}/editor.json`] });
const english = messagesFor('en');
const placeholders = (text: string) => [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
const screenshotKeys = [
  'export',
  'exportImage',
  'imageFormat',
  'quality',
  'transparency',
  'saveImage',
  'originalSize',
  'customSize',
  'dimensions',
  'advanced',
  'width',
  'height',
  'keepAspectRatio',
  'sizePreset',
];

describe('video and Screenshot export translations', () => {
  it.each(SUPPORTED_LOCALES)('has all dialog labels, hints, folder controls and completion actions in %s', (locale) => {
    const messages = messagesFor(locale);
    const namespaces = [
      ['ExportPopover', Object.keys(english.ExportPopover!)],
      ['DirectoryPreferences', Object.keys(english.DirectoryPreferences!)],
      ['Dialog', ['close']],
      ['QuickSnipStatus', ['failed', 'imageReady', 'ready', 'exportingImage', 'exporting', 'dismiss', 'actionFailed']],
      ['ScreenshotEditor', screenshotKeys],
    ] as const;
    for (const [namespace, keys] of namespaces) {
      for (const key of keys) {
        const value = messages[namespace]?.[key];
        const source = english[namespace]?.[key];
        expect(typeof value, `${locale}: ${namespace}.${key}`).toBe('string');
        expect(value!.trim(), `${locale}: ${namespace}.${key}`).not.toBe('');
        expect(placeholders(value!), `${locale}: ${namespace}.${key}`).toEqual(placeholders(source!));
      }
    }
  });
});
