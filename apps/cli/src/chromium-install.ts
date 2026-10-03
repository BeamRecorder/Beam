import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { Browser, computeExecutablePath, install } from '@puppeteer/browsers';
import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js';
import { chromiumSettings } from './chromium-settings';

export async function installChromium() {
  const cacheDir = chromiumSettings().cache;
  const buildId = PUPPETEER_REVISIONS.chrome;
  const browser = await install({ browser: Browser.CHROME, buildId, cacheDir });
  return { executable: browser.executablePath, version: buildId };
}

export async function chromiumExecutable() {
  const settings = chromiumSettings();
  const executable =
    settings.executable ??
    computeExecutablePath({
      browser: Browser.CHROME,
      buildId: PUPPETEER_REVISIONS.chrome,
      cacheDir: settings.cache,
    });
  try {
    await access(executable, constants.X_OK);
  } catch {
    throw new Error(
      `Chrome is unavailable at ${executable}. Run "beam browser install" or set BEAM_CHROMIUM_EXECUTABLE.`,
    );
  }
  return executable;
}
