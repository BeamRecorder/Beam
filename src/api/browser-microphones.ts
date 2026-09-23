import type { CaptureSource } from './types/capture-api';
import { enumerateBrowserMediaDevices } from './browser-media-devices';
import { MICROPHONE_PREFIX } from './browser-microphone-source';
export async function listBrowserMicrophones(): Promise<CaptureSource[]> {
  const devices = await enumerateBrowserMediaDevices();
  const audioInputs = devices.filter((device) => device.kind === 'audioinput');
  return audioInputs.map((device, index) => ({
    id: `${MICROPHONE_PREFIX}${device.deviceId}`,
    kind: 'microphone' as const,
    label: device.label || `Microphone ${index + 1}`,
    isDefault: index === 0,
  }));
}
