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
  'pt-BR',
  'ja',
  'it',
  'pl',
  'zh-TW',
  'hi',
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
  { value: 'pt-BR', label: 'PT-BR — Português (Brasil)' },
  { value: 'ja', label: 'JA — 日本語' },
  { value: 'it', label: 'IT — Italiano' },
  { value: 'pl', label: 'PL — Polski' },
  { value: 'zh-TW', label: 'ZH-TW — 繁體中文' },
  { value: 'hi', label: 'HI — हिन्दी' },
];

export function isSupportedLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
