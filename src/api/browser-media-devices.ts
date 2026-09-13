// Camera and microphone discovery share one Chromium request. Only coalesce
// concurrent reads: a later refresh must see plugged/unplugged devices.
let pendingDevices: Promise<MediaDeviceInfo[]> | null = null;

export function enumerateBrowserMediaDevices(): Promise<MediaDeviceInfo[]> {
  if (pendingDevices) return pendingDevices;
  if (!navigator.mediaDevices?.enumerateDevices) {
    return Promise.reject(new Error('Media device discovery is unavailable in this Chromium build.'));
  }
  pendingDevices = navigator.mediaDevices.enumerateDevices().finally(() => {
    pendingDevices = null;
  });
  return pendingDevices;
}
