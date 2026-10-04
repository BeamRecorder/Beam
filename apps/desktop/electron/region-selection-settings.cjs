function regionRecordingSettings(value, platform) {
  if (value == null) return undefined;
  if (!value || typeof value !== 'object') throw new TypeError('Invalid region recording settings');
  for (const key of ['cameraId', 'microphoneId']) {
    if (typeof value[key] !== 'string' || !value[key].length || value[key].length > 256)
      throw new TypeError(`Invalid region ${key}`);
  }
  if (!Number.isInteger(value.countdownSeconds) || value.countdownSeconds < 0 || value.countdownSeconds > 10)
    throw new TypeError('Invalid region countdown');
  for (const key of ['systemAudio', 'hideTaskbar', 'hideDesktopIcons', 'showRealCursor'])
    if (typeof value[key] !== 'boolean') throw new TypeError(`Invalid region ${key}`);
  if (value.zoomMode !== undefined && !['off', '2d', '3d', 'glass'].includes(value.zoomMode))
    throw new TypeError('Invalid region zoom preference');
  const desktopSupported = platform === 'win32' || platform === 'darwin';
  return {
    ...(value.zoomMode !== undefined ? { zoomMode: value.zoomMode } : {}),
    cameraId: value.cameraId,
    microphoneId: value.microphoneId,
    systemAudio: value.systemAudio,
    countdownSeconds: value.countdownSeconds,
    hideTaskbar: desktopSupported && value.hideTaskbar,
    hideDesktopIcons: desktopSupported && value.hideDesktopIcons,
    showRealCursor: value.showRealCursor,
  };
}
module.exports = { regionRecordingSettings };
