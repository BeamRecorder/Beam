import type { AppLocale } from './types';

export const SUPPORTED_LOCALES = [
  'en',
  'fr',
  'es',
  'de',
  'ru',
  'bg',
  'zh-CN',
  'ko',
] as const satisfies readonly AppLocale[];

export const localeOptions: Array<{ value: AppLocale; label: string }> = [
  { value: 'en', label: 'EN — English' },
  { value: 'fr', label: 'FR — Français' },
  { value: 'es', label: 'ES — Español' },
  { value: 'de', label: 'DE — Deutsch' },
  { value: 'ru', label: 'RU — Русский' },
  { value: 'bg', label: 'BG — Български' },
  { value: 'zh-CN', label: 'ZH — 简体中文' },
  { value: 'ko', label: 'KO — 한국어' },
];

export function isSupportedLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
