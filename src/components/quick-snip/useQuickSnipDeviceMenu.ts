import { capture } from '~/api/capture';
import { listBrowserCameras } from '~/api/camera-recorder';
import { listBrowserMicrophones } from '~/api/microphone-recorder';
import { useTranslate } from '~/i18n/useTranslate';
import type { QuickSnipDeviceKind, QuickSnipDeviceMenu } from '~/api/types/quick-snip';
import type { QuickSnipDeviceControls, QuickSnipDeviceFlags } from './quick-snip-device-types';

export function useQuickSnipDeviceMenu(controls: QuickSnipDeviceControls) {
  const { t } = useTranslate('HUD');
  const { t: quickText } = useTranslate('QuickSnipCropBar');
  const flags: QuickSnipDeviceFlags = {
    microphone: controls.microphone,
    camera: controls.camera,
    systemAudio: controls.systemAudio,
  };
  const keys = { microphone: 'micId', camera: 'cameraId', systemAudio: 'systemAudioMode' } as const;
  const off = { microphone: 'no-audio', camera: 'off', systemAudio: 'off' } as const;

  const chooseDevice = async (kind: QuickSnipDeviceKind, position?: QuickSnipDeviceMenu['position']) => {
    if (controls.disabled() || !controls.configuration.value) return;
    const generation = controls.generation();
    controls.busy.value = true;
    try {
      const sources =
        kind === 'camera' ? await listBrowserCameras() : kind === 'microphone' ? await listBrowserMicrophones() : [];
      if (generation !== controls.generation()) return;
      const options =
        kind === 'systemAudio'
          ? [
              { id: 'on', label: quickText('defaultSystemAudio') },
              { id: 'off', label: t('off') },
            ]
          : [
              ...sources.map(({ id, label }) => ({ id, label })),
              { id: off[kind], label: t(kind === 'camera' ? 'cameraOff' : 'noAudio') },
            ];
      const configuredId = controls.configuration.value?.devices[keys[kind]];
      const selectedId = !flags[kind].value
        ? off[kind]
        : kind === 'systemAudio'
          ? 'on'
          : typeof configuredId === 'string' && configuredId !== 'default' && configuredId !== off[kind]
            ? configuredId
            : (sources.find((source) => source.isDefault)?.id ?? '');
      const selected = await capture.chooseQuickSnipDevice({
        kind,
        options,
        selectedId,
        ...(position && { position }),
      });
      if (selected === null || generation !== controls.generation() || !controls.configuration.value) return;
      if (!options.some((option) => option.id === selected)) throw new Error('Unknown recording device.');
      controls.configuration.value = {
        ...controls.configuration.value,
        devices: { ...controls.configuration.value.devices, [keys[kind]]: selected },
      };
      flags[kind].value = selected !== off[kind];
      controls.busy.value = false;
      const saving = controls.synchronize();
      controls.busy.value = true;
      await saving;
    } finally {
      controls.busy.value = false;
    }
  };
  const onDeviceKeydown = (kind: QuickSnipDeviceKind, event: KeyboardEvent) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    const bounds = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    return chooseDevice(kind, bounds ? { x: Math.round(bounds.left), y: Math.round(bounds.bottom) } : undefined);
  };
  return { chooseDevice, onDeviceKeydown };
}
