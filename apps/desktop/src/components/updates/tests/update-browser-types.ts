import type { AppLocale } from '~/i18n/types';

export interface UpdateBrowserWindow extends Window {
  setUpdateLocale(locale: AppLocale): Promise<boolean>;
}
