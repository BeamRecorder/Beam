// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNativeClient } from './native-client';
const state = vi.hoisted(() => ({ access: vi.fn(), mkdir: vi.fn(), target: vi.fn(), construct: vi.fn() }));
vi.mock('node:fs/promises', () => ({ access: state.access, mkdir: state.mkdir }));
vi.mock('@beam/native-client/cargo-build-paths', () => ({ resolveCargoTargetDirectory: state.target }));
vi.mock('@beam/storage/node/platform-paths', () => ({ applicationPaths: () => ({ data: '/userdata' }) }));
vi.mock('@beam/native-client', () => ({
  NativeCaptureClient: class {
    constructor(options: unknown) {
      state.construct(options);
    }
  },
}));
const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('BEAM_APPLICATION_ROOT', '/checkout');
  vi.stubEnv('BEAM_APP_VERSION', '1.2.3');
  vi.stubEnv('BEAM_CAPTURE_ENGINE', '');
  vi.stubEnv('BEAM_RESOURCES_PATH', '');
  state.target.mockReturnValue('/cargo-cache');
});
afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(process, 'platform', descriptor);
});
const options = () =>
  state.construct.mock.calls[0][0] as {
    executable(): string;
    workingDirectory(): string;
    inputHelperPath(): string | null;
  };
it.each(['linux', 'darwin', 'win32'])('uses the current release version by default on %s', async (platform) => {
  Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
  vi.stubEnv('BEAM_APP_VERSION', undefined);
  vi.stubEnv('BEAM_RESOURCES_PATH', '/resources');
  state.access.mockResolvedValue(undefined);
  await createNativeClient();
  expect(options().executable()).toBe(
    `/resources/capture-engine/capture-engine-0.5.0${platform === 'win32' ? '.exe' : ''}`,
  );
  expect(state.target).not.toHaveBeenCalled();
});
it.each(['linux', 'darwin', 'win32'])(
  'resolves the packaged %s executable without requiring Cargo',
  async (platform) => {
    Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
    vi.stubEnv('BEAM_RESOURCES_PATH', '/resources');
    state.access.mockResolvedValue(undefined);
    await createNativeClient();
    expect(options().executable()).toBe(
      `/resources/capture-engine/capture-engine-1.2.3${platform === 'win32' ? '.exe' : ''}`,
    );
    expect(options().workingDirectory()).toBe('/userdata');
    expect(options().inputHelperPath()).toBeNull();
    expect(state.target).not.toHaveBeenCalled();
  },
);
it.each([
  ['linux', 'linux'],
  ['darwin', 'mac'],
  ['win32', 'win'],
])('resolves the explicit %s prebuilt location', async (platform, folder) => {
  Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
  state.access.mockResolvedValue(undefined);
  await createNativeClient();
  expect(options().executable()).toContain(`/packages/native-recorder/${folder}/`);
});
it('uses an explicit executable and input helper exactly as configured', async () => {
  vi.stubEnv('BEAM_CAPTURE_ENGINE', '/custom/native');
  vi.stubEnv('BEAM_INPUT_HELPER_PATH', '/custom/input');
  state.access.mockResolvedValue(undefined);
  await createNativeClient();
  expect(options().executable()).toBe('/custom/native');
  expect(options().inputHelperPath()).toBe('/custom/input');
  expect(state.access).toHaveBeenCalledOnce();
});
it.each(['debug', 'release'])('resolves a Cargo %s build outside the checkout', async (profile) => {
  state.access.mockImplementation(async (path) => {
    if (path !== `/cargo-cache/${profile}/capture-engine`) throw new Error('absent');
  });
  await createNativeClient();
  expect(options().executable()).toBe(`/cargo-cache/${profile}/capture-engine`);
  expect(state.target).toHaveBeenCalledWith('/checkout');
});
it('reports missing installed or explicit executables without searching development builds', async () => {
  state.access.mockRejectedValue(new Error('absent'));
  vi.stubEnv('BEAM_CAPTURE_ENGINE', '/absent');
  await expect(createNativeClient()).rejects.toThrow('Checked: /absent');
  vi.stubEnv('BEAM_CAPTURE_ENGINE', '');
  vi.stubEnv('BEAM_RESOURCES_PATH', '/resources');
  await expect(createNativeClient()).rejects.toThrow('backend unavailable');
  expect(state.target).not.toHaveBeenCalled();
});
it('reports missing development builds and filesystem failures before creating a process', async () => {
  state.access.mockRejectedValue(new Error('absent'));
  await expect(createNativeClient()).rejects.toThrow('/cargo-cache/release/capture-engine');
  state.access.mockResolvedValue(undefined);
  state.mkdir.mockRejectedValue(new Error('read-only directory'));
  await expect(createNativeClient()).rejects.toThrow('read-only directory');
  expect(state.construct).not.toHaveBeenCalled();
});
it('derives the checkout root when no host root is configured', async () => {
  vi.unstubAllEnvs();
  state.access.mockResolvedValue(undefined);
  await createNativeClient();
  expect(options().executable()).toContain('/packages/native-recorder/');
});
