import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ open: vi.fn(), error: vi.fn() }));
vi.mock('~/api/capture', () => ({ capture: { openHudSettings: mocks.open } }));
vi.mock('~/ui/toast/toastStore', () => ({ useToastStore: () => ({ error: mocks.error }) }));
import { openApplicationSettings } from './open-application-settings';
beforeEach(() => vi.clearAllMocks());
it('opens the shared native Settings window', async () => {
  mocks.open.mockResolvedValueOnce(true);
  expect(await openApplicationSettings()).toBe(true);
  expect(mocks.error).not.toHaveBeenCalled();
});
it('preserves a declined native open result', async () => {
  mocks.open.mockResolvedValueOnce(false);
  expect(await openApplicationSettings()).toBe(false);
  expect(mocks.error).not.toHaveBeenCalled();
});
it.each([new Error('Unavailable'), 'Disconnected'])('reports a native open failure: %s', async (reason) => {
  mocks.open.mockRejectedValueOnce(reason);
  expect(await openApplicationSettings()).toBe(false);
  expect(mocks.error).toHaveBeenCalledWith(reason instanceof Error ? reason.message : reason);
});
