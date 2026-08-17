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
      ['hi', 'रिकॉर्डिंग शुरू करें'],
      ['vi', 'Bắt đầu ghi'],
    ] as const;

    for (const [locale, expected] of checks) {
      setCurrentLocale(locale);
      expect(i18n.global.t('HUD.startRecording')).toBe(expected);
    }
  });

  it('keeps interpolation parameters intact in every added locale', () => {
    for (const locale of ['ru', 'bg', 'zh-CN', 'ko', 'pt-BR', 'ja', 'it', 'pl', 'zh-TW', 'hi', 'vi'] as const) {
      setCurrentLocale(locale);
      expect(i18n.global.t('HUD.stopRecording', { time: '00:03' })).toContain('00:03');
      expect(i18n.global.t('Updates.downloading', { percent: 42 })).toContain('42%');
    }
  });

  it('translates every editor loading stage in every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      setCurrentLocale(locale);
      for (const stage of ['openingWindow', 'loadingEditor', 'loadingProject', 'loadingTimeline', 'renderingEditor']) {
        expect(i18n.global.te(`EditorPreparingHud.${stage}`, locale)).toBe(true);
      }
    }
  });

  it('keeps keyboard and text caption labels available in every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      setCurrentLocale(locale);
      for (const key of ['keyboardCaptions', 'textCaptions']) {
        expect(i18n.global.te(`SidebarPanel.${key}`, locale)).toBe(true);
        expect(i18n.global.t(`SidebarPanel.${key}`)).not.toBe(`SidebarPanel.${key}`);
        expect(i18n.global.te(`TimelineTracks.${key}`, locale)).toBe(true);
        expect(i18n.global.t(`TimelineTracks.${key}`)).not.toBe(`TimelineTracks.${key}`);
      }
      for (const captionKey of [
        'aiAutoCaptioning',
        'headerDesc',
        'audioSource',
        'whisperModel',
        'modelReady',
        'downloadModel',
        'deleteModel',
        'generateCaptions',
        'regenerateAICaptions',
        'processing',
        'preparingAudio',
        'cancel',
      ]) {
        expect(
          i18n.global.te(`CaptionPanel.${captionKey}`, locale),
          `${locale}: missing CaptionPanel.${captionKey}`,
        ).toBe(true);
      }
    }
  });

  it('keeps the blur track label available in every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      setCurrentLocale(locale);
      expect(i18n.global.te('TimelineTracks.blur', locale), `${locale}: missing TimelineTracks.blur`).toBe(true);
      expect(i18n.global.t('TimelineTracks.blur')).not.toBe('TimelineTracks.blur');
    }
  });

  it('provides every preview quality label in every supported locale', () => {
    const keys = [
      'previewQuality',
      'previewQualityFull',
      'previewQualityHalf',
      'previewQualityQuarter',
      'previewQualityExportHint',
      'previewQualitySuggestion',
      'previewQualityCriticalSuggestion',
    ];

    for (const locale of SUPPORTED_LOCALES) {
      setCurrentLocale(locale);
      for (const key of keys) {
        expect(i18n.global.te(`TimelineToolbar.${key}`, locale), `${locale}: missing TimelineToolbar.${key}`).toBe(
          true,
        );
        expect(i18n.global.t(`TimelineToolbar.${key}`)).not.toBe(`TimelineToolbar.${key}`);
      }
    }
  });

  it('provides every preview performance label in every supported locale', () => {
    const keys = [
      'title',
      'ui',
      'worker',
      'audio',
      'media',
      'warning',
      'criticalWarning',
      'reduceQuality',
      'higherIsWorse',
      'good',
      'high',
      'critical',
    ];

    for (const locale of SUPPORTED_LOCALES) {
      setCurrentLocale(locale);
      for (const key of keys) {
        expect(
          i18n.global.te(`PreviewPerformance.${key}`, locale),
          `${locale}: missing PreviewPerformance.${key}`,
        ).toBe(true);
        expect(i18n.global.t(`PreviewPerformance.${key}`)).not.toBe(`PreviewPerformance.${key}`);
      }
    }
  });

  it('provides distinct export help for each selectable frame rate in every supported locale', () => {
    const keys = ['frameRate24Desc', 'frameRate30Desc', 'frameRate60Desc'];

    for (const locale of SUPPORTED_LOCALES) {
      setCurrentLocale(locale);
      for (const key of keys) {
        expect(i18n.global.te(`ExportPopover.${key}`, locale), `${locale}: missing ExportPopover.${key}`).toBe(true);
        expect(i18n.global.t(`ExportPopover.${key}`)).not.toBe(`ExportPopover.${key}`);
      }
    }
  });

  it('uses the compact Performance title in the default locale', () => {
    setCurrentLocale('en');
    expect(i18n.global.t('PreviewPerformance.title')).toBe('Performance');
  });

  it('provides translated timeline clipboard feedback in every supported locale', () => {
    const expected = {
      en: ['Copied', 'Pasted'],
      fr: ['Copié', 'Collé'],
      es: ['Copiado', 'Pegado'],
      de: ['Kopiert', 'Eingefügt'],
      ru: ['Скопировано', 'Вставлено'],
      bg: ['Копирано', 'Поставено'],
      'zh-CN': ['已复制', '已粘贴'],
      ko: ['복사됨', '붙여넣음'],
      'pt-BR': ['Copiado', 'Colado'],
      ja: ['コピーしました', '貼り付けました'],
      it: ['Copiato', 'Incollato'],
      pl: ['Skopiowano', 'Wklejono'],
      'zh-TW': ['已複製', '已貼上'],
      hi: ['कॉपी किया गया', 'पेस्ट किया गया'],
      vi: ['Đã sao chép', 'Đã dán'],
    } as const;

    for (const locale of SUPPORTED_LOCALES) {
      setCurrentLocale(locale);
      for (const [index, key] of ['timelineCopied', 'timelinePasted'].entries()) {
        expect(i18n.global.te(`VideoEditor.${key}`, locale), `${locale}: missing VideoEditor.${key}`).toBe(true);
        expect(i18n.global.t(`VideoEditor.${key}`)).toBe(expected[locale][index]);
      }
    }
  });

  it('provides detailed timeline clipboard labels and interpolation in every supported locale', () => {
    const keys = ['timelineCopiedItem', 'timelinePastedItem', 'timelineClipboardCaption', 'timelineClipboardZoom'];
    for (const locale of SUPPORTED_LOCALES) {
      setCurrentLocale(locale);
      for (const key of keys) {
        expect(i18n.global.te(`VideoEditor.${key}`, locale), `${locale}: missing VideoEditor.${key}`).toBe(true);
        expect(i18n.global.t(`VideoEditor.${key}`)).not.toBe(`VideoEditor.${key}`);
      }
      expect(i18n.global.t('VideoEditor.timelineCopiedItem', { item: 'capture.mp4' })).toContain('capture.mp4');
      expect(i18n.global.t('VideoEditor.timelinePastedItem', { item: 'capture.mp4' })).toContain('capture.mp4');
      expect(i18n.global.t('VideoEditor.timelineClipboardCaption', { text: 'Hello timeline' })).toContain(
        'Hello timeline',
      );
      expect(i18n.global.t('VideoEditor.timelineClipboardZoom', { number: 2 })).toContain('2');
    }
  });

  it('keeps the preferences About and Linux interaction catalog complete', () => {
    const keys = [
      'about',
      'aboutDesc',
      'view',
      'version',
      'aboutDescriptionTitle',
      'aboutDescriptionText',
      'interactionAccessDescriptionLinux',
      'recordInteractionsDescriptionLinux',
    ];

    for (const locale of SUPPORTED_LOCALES) {
      setCurrentLocale(locale);
      for (const key of keys) {
        expect(i18n.global.te(`HudPreferences.${key}`, locale)).toBe(true);
        expect(i18n.global.t(`HudPreferences.${key}`)).not.toBe(`HudPreferences.${key}`);
      }
      expect(i18n.global.t('HudPreferences.version', { version: '9.9.9' })).toContain('9.9.9');
    }
  });

  it('registers every live-HUD onboarding instruction in every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      setCurrentLocale(locale);
      for (const key of ['tourSubtitle', 'emptyStateDesc']) {
        expect(i18n.global.te(`Onboarding.${key}`, locale), `${locale}: missing Onboarding.${key}`).toBe(true);
        expect(i18n.global.t(`Onboarding.${key}`), `${locale}: unresolved Onboarding.${key}`).not.toBe(
          `Onboarding.${key}`,
        );
      }
    }
  });

  it('persists the selected locale and updates the document language', () => {
    setCurrentLocale('zh-CN');
    expect(localStorage.getItem('locale')).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
