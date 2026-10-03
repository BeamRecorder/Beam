// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import type { Browser } from 'puppeteer-core';
import { createCliGpuMonitor } from './gpu-monitor';
const state = vi.hoisted(() => ({ request: vi.fn(), shutdown: vi.fn(), client: vi.fn() }));
vi.mock('./native-client', () => ({ createNativeClient: state.client }));
afterEach(() => vi.resetAllMocks());
function fixture() {
  state.request.mockResolvedValue({ version: 1, status: 'warming', source: 'linux-drm', scope: 'process' });
  state.client.mockResolvedValue({ request: state.request, shutdown: state.shutdown });
  const send = vi.fn(async () => ({
    processInfo: [
      { id: 42, type: 'GPU' },
      { id: 17, type: 'renderer' },
    ],
  }));
  const detach = vi.fn(async () => {});
  const browser = { target: () => ({ createCDPSession: async () => ({ send, detach }) }) } as unknown as Browser;
  return { browser, send, detach };
}
it('samples only GPU processes through the shared native protocol and releases both transports', async () => {
  const fixtureState = fixture();
  const result = await createCliGpuMonitor(fixtureState.browser).finish();
  expect(result.source).toBe('linux-drm');
  expect(fixtureState.send).toHaveBeenCalledWith('SystemInfo.getProcessInfo');
  expect(state.request).toHaveBeenCalledWith('gpu-usage', { processIds: [42] }, { timeoutMs: 2000 });
  expect(state.shutdown).toHaveBeenCalledOnce();
  expect(fixtureState.detach).toHaveBeenCalledOnce();
});
it('does not fail the export when the native backend or browser diagnostics are unavailable', async () => {
  const fixtureState = fixture();
  state.client.mockRejectedValue(new Error('Binary absent'));
  const result = await createCliGpuMonitor(fixtureState.browser).finish();
  expect(result.status).toBe('unavailable');
  expect(result.issues[0].reason).toBe('Binary absent');
  expect(fixtureState.detach).toHaveBeenCalledOnce();
});
it('still shuts down the native process when CDP disposal fails', async () => {
  const fixtureState = fixture();
  fixtureState.detach.mockRejectedValue(new Error('CDP disconnected'));
  const result = await createCliGpuMonitor(fixtureState.browser).finish();
  expect(state.shutdown).toHaveBeenCalledOnce();
  expect(result.issues[0].reason).toContain('CDP disconnected');
});

it('reports CDP process lookup failures and still releases the native transport', async () => {
  const fixtureState = fixture();
  fixtureState.send.mockRejectedValue(new Error('No process info'));
  const result = await createCliGpuMonitor(fixtureState.browser).finish();
  expect(result.status).toBe('unavailable');
  expect(state.shutdown).toHaveBeenCalledOnce();
});
it('handles a browser diagnostic session that fails before creation', async () => {
  fixture();
  const browser = {
    target: () => ({
      createCDPSession: async () => {
        throw new Error('Session unavailable');
      },
    }),
  } as unknown as Browser;
  const result = await createCliGpuMonitor(browser).finish();
  expect(result.issues[0].reason).toBe('Session unavailable');
  expect(state.shutdown).toHaveBeenCalledOnce();
});
