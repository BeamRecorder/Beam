import { defineComponent, h, ref, shallowRef } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickSnipConfiguration } from '~/api/types/quick-snip';
import { useQuickSnipDeviceMenu } from './useQuickSnipDeviceMenu';

const mocks = vi.hoisted(() => ({ cameras: vi.fn(), microphones: vi.fn(), choose: vi.fn() }));
vi.mock('~/api/camera-recorder', () => ({ listBrowserCameras: mocks.cameras }));
vi.mock('~/api/microphone-recorder', () => ({ listBrowserMicrophones: mocks.microphones }));
vi.mock('~/api/capture', () => ({ capture: { chooseQuickSnipDevice: mocks.choose } }));
const wrappers: Array<ReturnType<typeof mount>> = [];
function fixture() {
  const configuration = shallowRef<QuickSnipConfiguration | null>({
    name: 'job',
    mode: 'studio',
    format: 'mp4',
    automaticZoom: false,
    screenKind: 'display',
    displayId: '1',
    region: null,
    regionBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    devices: { micId: 'default', cameraId: 'off', systemAudioMode: 'off' },
    preset: {
      id: 'default',
      name: 'Default',
      protected: true,
      updatedAt: '',
      settings: { editor: { schemaVersion: 1 }, devices: {}, export: {}, quickSnip: { automaticZoom: false } },
    },
  });
  const microphone = ref(true),
    camera = ref(false),
    systemAudio = ref(false),
    busy = ref(false);
  let generation = 0,
    disabled = false;
  const synchronize = vi.fn(async (): Promise<void> => undefined);
  let menu!: ReturnType<typeof useQuickSnipDeviceMenu>;
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          menu = useQuickSnipDeviceMenu({
            configuration,
            microphone,
            camera,
            systemAudio,
            busy,
            disabled: () => disabled || busy.value,
            generation: () => generation,
            synchronize,
          });
          return () => h('div');
        },
      }),
    ),
  );
  return {
    configuration,
    microphone,
    camera,
    systemAudio,
    busy,
    synchronize,
    menu,
    replace: () => generation++,
    disable: () => {
      disabled = true;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cameras.mockResolvedValue([{ id: 'camera:chromium:usb', label: 'USB camera', isDefault: true }]);
  mocks.microphones.mockResolvedValue([{ id: 'microphone:chromium:usb', label: 'USB microphone', isDefault: true }]);
  mocks.choose.mockResolvedValue(null);
});
afterEach(() => {
  while (wrappers.length) wrappers.pop()!.unmount();
});

describe('Quick Snip native device choices', () => {
  it('selects and enables a camera, preserving the other device choices and synchronizing once', async () => {
    const f = fixture();
    mocks.choose.mockResolvedValue('camera:chromium:usb');
    await f.menu.chooseDevice('camera');
    expect(mocks.choose).toHaveBeenCalledWith({
      kind: 'camera',
      selectedId: 'off',
      options: [
        { id: 'camera:chromium:usb', label: 'USB camera' },
        { id: 'off', label: 'Camera Off' },
      ],
    });
    expect(f.configuration.value?.devices).toEqual({
      micId: 'default',
      cameraId: 'camera:chromium:usb',
      systemAudioMode: 'off',
    });
    expect(f.camera.value).toBe(true);
    expect(f.synchronize).toHaveBeenCalledOnce();
    expect(f.busy.value).toBe(false);
  });

  it('marks the actual default microphone and can disable it', async () => {
    const f = fixture();
    mocks.choose.mockResolvedValue('no-audio');
    await f.menu.chooseDevice('microphone');
    expect(mocks.choose).toHaveBeenCalledWith(expect.objectContaining({ selectedId: 'microphone:chromium:usb' }));
    expect(f.microphone.value).toBe(false);
    expect(f.configuration.value?.devices.micId).toBe('no-audio');
    expect(f.synchronize).toHaveBeenCalledOnce();
  });

  it('offers the native default system output and Off without enumerating microphones or cameras', async () => {
    const f = fixture();
    mocks.choose.mockResolvedValue('on');
    await f.menu.chooseDevice('systemAudio');
    expect(mocks.choose).toHaveBeenCalledWith({
      kind: 'systemAudio',
      selectedId: 'off',
      options: [
        { id: 'on', label: 'Default system output' },
        { id: 'off', label: 'Off' },
      ],
    });
    expect(mocks.cameras).not.toHaveBeenCalled();
    expect(mocks.microphones).not.toHaveBeenCalled();
    expect(f.systemAudio.value).toBe(true);
    expect(f.configuration.value?.devices.systemAudioMode).toBe('on');
  });

  it('leaves settings unchanged when a menu is dismissed', async () => {
    const f = fixture();
    await f.menu.chooseDevice('camera');
    expect(f.camera.value).toBe(false);
    expect(f.synchronize).not.toHaveBeenCalled();
    expect(f.busy.value).toBe(false);
  });

  it('discards discovery that completes after the selection was canceled or replaced', async () => {
    const f = fixture();
    let resolve!: (value: []) => void;
    mocks.cameras.mockReturnValueOnce(
      new Promise<[]>((done) => {
        resolve = done;
      }),
    );
    const choosing = f.menu.chooseDevice('camera');
    expect(f.busy.value).toBe(true);
    f.replace();
    resolve([]);
    await choosing;
    expect(mocks.choose).not.toHaveBeenCalled();
    expect(f.synchronize).not.toHaveBeenCalled();
    expect(f.busy.value).toBe(false);
  });

  it('ignores a stale native selection and blocks a second menu while the first is open', async () => {
    const f = fixture();
    let resolve!: (value: string) => void;
    mocks.choose.mockReturnValueOnce(
      new Promise<string>((done) => {
        resolve = done;
      }),
    );
    const choosing = f.menu.chooseDevice('camera');
    await flushPromises();
    await f.menu.chooseDevice('microphone');
    expect(mocks.microphones).not.toHaveBeenCalled();
    f.replace();
    resolve('camera:chromium:usb');
    await choosing;
    expect(f.camera.value).toBe(false);
    expect(f.synchronize).not.toHaveBeenCalled();
  });

  it('allows turning the microphone off when no devices are connected', async () => {
    const f = fixture();
    mocks.microphones.mockResolvedValue([]);
    await f.menu.chooseDevice('microphone');
    expect(mocks.choose).toHaveBeenCalledWith({
      kind: 'microphone',
      selectedId: '',
      options: [{ id: 'no-audio', label: 'No Audio' }],
    });
  });

  it('does not discover or display devices when changes are disabled', async () => {
    const f = fixture();
    f.disable();
    await f.menu.chooseDevice('camera');
    expect(mocks.cameras).not.toHaveBeenCalled();
    expect(mocks.choose).not.toHaveBeenCalled();
  });

  it('reports discovery and menu failures, clearing pending state for another attempt', async () => {
    const f = fixture();
    mocks.cameras.mockRejectedValueOnce(new Error('Disconnected'));
    await expect(f.menu.chooseDevice('camera')).rejects.toThrow('Disconnected');
    expect(f.busy.value).toBe(false);
    mocks.choose.mockRejectedValueOnce(new Error('Window closed'));
    await expect(f.menu.chooseDevice('camera')).rejects.toThrow('Window closed');
    expect(f.busy.value).toBe(false);
    expect(f.synchronize).not.toHaveBeenCalled();
  });

  it('supports the keyboard context-menu shortcut and ignores ordinary typing', async () => {
    const f = fixture();
    const keyboard = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, cancelable: true });
    await f.menu.onDeviceKeydown('camera', keyboard);
    expect(keyboard.defaultPrevented).toBe(true);
    expect(mocks.choose).toHaveBeenCalledOnce();
    await f.menu.onDeviceKeydown('camera', new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(mocks.choose).toHaveBeenCalledOnce();
  });

  it('anchors the keyboard menu below the focused device button', async () => {
    const f = fixture();
    const button = document.createElement('button');
    button.getBoundingClientRect = () => ({ left: 40.4, bottom: 112.2 }) as DOMRect;
    const event = new KeyboardEvent('keydown', { key: 'ContextMenu' });
    Object.defineProperty(event, 'currentTarget', { value: button });
    await f.menu.onDeviceKeydown('microphone', event);
    expect(mocks.choose).toHaveBeenCalledWith(expect.objectContaining({ position: { x: 40, y: 112 } }));
  });

  it('blocks another selection until the chosen device has finished synchronizing', async () => {
    const f = fixture();
    mocks.choose.mockResolvedValueOnce('camera:chromium:usb');
    let resolve!: () => void;
    f.synchronize.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const choosing = f.menu.chooseDevice('camera');
    await flushPromises();
    expect(f.busy.value).toBe(true);
    await f.menu.chooseDevice('microphone');
    expect(mocks.microphones).not.toHaveBeenCalled();
    resolve();
    await choosing;
    expect(f.busy.value).toBe(false);
  });
});
