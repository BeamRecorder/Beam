import type { Browser } from 'puppeteer-core';
import { createGpuMonitor } from '@beam/system-metrics/node/gpu-monitor';
import { createNativeClient } from './native-client';

export function createCliGpuMonitor(browser: Browser) {
  // Native discovery is lazy: an absent capture binary is a reported capability failure, not an export failure.
  const client = createNativeClient();
  void client.catch(() => undefined);
  const session = browser.target().createCDPSession();
  void session.catch(() => undefined);
  return createGpuMonitor({
    processIds: async () => {
      const { processInfo } = await (await session).send('SystemInfo.getProcessInfo');
      return processInfo.filter((process) => process.type.toLowerCase() === 'gpu').map((process) => process.id);
    },
    sample: async (processIds) => (await client).request('gpu-usage', { processIds }, { timeoutMs: 2000 }),
    dispose: async () => {
      const [native, cdp] = await Promise.allSettled([client, session]);
      try {
        if (cdp.status === 'fulfilled') await cdp.value.detach();
      } finally {
        if (native.status === 'fulfilled') await native.value.shutdown();
      }
    },
  });
}
