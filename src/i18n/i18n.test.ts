import { afterEach, describe, expect, it } from 'vitest';
import { i18n, setCurrentLocale } from './index';
import { localeOptions, SUPPORTED_LOCALES } from './locales';

afterEach(() => {
  setCurrentLocale('en');
});

describe('internationalization', () => {
  it('registers every supported locale in the language picker', () => {
    expect(i18n.global.availableLocales).toEqual(expect.arrayContaining([...SUPPORTED_LOCALES]));
    expect(localeOptions.map((option) => option.value)).toEqual([...SUPPORTED_LOCALES]);
  });

  it('renders UTF-8 translations across the supported writing systems', () => {
    const checks = [
      ['ru', 'Начать запись'],
      ['bg', 'Започване на запис'],
      ['zh-CN', '开始录制'],
      ['ko', '녹화 시작'],
      ['pt-BR', 'Iniciar gravação'],
      ['ja', '録画を開始'],
      ['it', 'Avvia registrazione'],
      ['pl', 'Rozpocznij nagrywanie'],
      ['zh-TW', '開始錄影'],
    ] as const;

    for (const [locale, expected] of checks) {
      setCurrentLocale(locale);
      expect(i18n.global.t('HUD.startRecording')).toBe(expected);
    }
  });

  it('keeps interpolation parameters intact in every added locale', () => {
    for (const locale of ['ru', 'bg', 'zh-CN', 'ko', 'pt-BR', 'ja', 'it', 'pl', 'zh-TW'] as const) {
      setCurrentLocale(locale);
      expect(i18n.global.t('HUD.stopRecording', { time: '00:03' })).toContain('00:03');
      expect(i18n.global.t('Updates.downloading', { percent: 42 })).toContain('42%');
    }
  });

  it('persists the selected locale and updates the document language', () => {
    setCurrentLocale('zh-CN');
    expect(localStorage.getItem('locale')).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
