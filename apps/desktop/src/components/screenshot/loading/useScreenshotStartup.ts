import { createScreenshotStartup } from './screenshot-startup';
import { injectScreenshotStartup, provideScreenshotStartup } from './screenshot-startup-context';

export function useScreenshotStartup() {
  const startup = injectScreenshotStartup() ?? createScreenshotStartup();
  provideScreenshotStartup(startup);
  return startup;
}
