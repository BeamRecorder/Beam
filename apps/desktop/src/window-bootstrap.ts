import type { Pinia } from 'pinia';
import { initI18n } from './i18n';
import { useThemeStore } from './stores/theme';

export async function prepareWindowAppearance(pinia: Pinia) {
  const [i18n] = await Promise.all([initI18n(), useThemeStore(pinia).ready]);
  return i18n;
}
