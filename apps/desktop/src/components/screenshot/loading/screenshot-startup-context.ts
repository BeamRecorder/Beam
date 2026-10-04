import { inject, provide, type InjectionKey } from 'vue';
import type { ScreenshotStartup } from './screenshot-startup-types';

const key: InjectionKey<ScreenshotStartup> = Symbol('ScreenshotStartup');
export const injectScreenshotStartup = () => inject(key, null);
export const provideScreenshotStartup = (startup: ScreenshotStartup) => provide(key, startup);
