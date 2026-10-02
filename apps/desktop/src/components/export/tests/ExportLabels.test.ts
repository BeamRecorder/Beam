import { describe, expect, it } from 'vitest';

const messages = import.meta.glob<{ ExportPopover: Record<string, string> }>('../../../i18n/*/core.json', {
  eager: true,
  import: 'default',
});
const expected = {
  bg: ['Експортиране', ' ({seconds} сек)'],
  de: ['Exportieren', ' ({seconds} s)'],
  en: ['Export', ' ({seconds}s)'],
  es: ['Exportar', ' ({seconds} s)'],
  fr: ['Exporter', ' ({seconds} s)'],
  hi: ['निर्यात करें', ' ({seconds} सेकंड)'],
  it: ['Esporta', ' ({seconds} s)'],
  ja: ['書き出す', '（{seconds}秒）'],
  ko: ['내보내기', ' ({seconds}초)'],
  pl: ['Eksportuj', ' ({seconds} s)'],
  'pt-BR': ['Exportar', ' ({seconds} s)'],
  ru: ['Экспорт', ' ({seconds} с)'],
  vi: ['Xuất', ' ({seconds} giây)'],
  'zh-CN': ['导出', '（{seconds} 秒）'],
  'zh-TW': ['匯出', '（{seconds} 秒）'],
};
describe('concise export labels', () => {
  it('covers all 15 supported languages', () => expect(Object.keys(messages)).toHaveLength(15));
  it.each(Object.entries(expected))(
    'keeps the action, duration and accessible label concise in %s',
    (locale, [label, suffix]) => {
      const translation = messages[`../../../i18n/${locale}/core.json`]!.ExportPopover;
      expect(translation.exportVideo).toBe(label);
      expect(translation.exportVideoAria).toBe(label);
      expect(translation.exportVideoDuration).toBe(label! + suffix);
    },
  );
});
