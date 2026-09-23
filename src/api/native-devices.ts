import { capture } from './capture';
import type { CaptureSource } from './types/capture-api';
async function devices(kind: 'camera' | 'microphone'): Promise<CaptureSource[]> {
  const catalog = await capture.nativeMediaDevices();
  const key = kind === 'camera' ? 'cameras' : 'microphones';
  if (catalog.errors[key]) throw new Error(catalog.errors[key]!);
  return catalog[key].map((item, index) => ({
    id: item.id,
    kind,
    label: item.name,
    isDefault: item.isDefault ?? index === 0,
    selectionMode: 'direct',
  }));
}
export const listNativeCameras = () => devices('camera');
export const listNativeMicrophones = () => devices('microphone');
export const systemAudioSource = (): CaptureSource => ({
  id: 'system:default',
  kind: 'system-audio',
  label: 'System audio',
  isDefault: true,
  selectionMode: 'direct',
});
