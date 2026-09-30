function regionRecordingSettings(value, platform) {
  if (value == null) return undefined;
  if (!value || typeof value !== 'object') throw new TypeError('Invalid region recording settings');
  for (const key of ['cameraId', 'microphoneId']) {
    if (typeof value[key] !== 'string' || !value[key].length || value[key].length > 256)
      throw new TypeError(`Invalid region ${key}`);
  }
  if (!Number.isInteger(value.countdownSeconds) || value.countdownSeconds < 0 || value.countdownSeconds > 10)
    throw new TypeError('Invalid region countdown');
  for (const key of ['systemAudio', 'hideTaskbar', 'hideDesktopIcons'])
    if (typeof value[key] !== 'boolean') throw new TypeError(`Invalid region ${key}`);
  const desktopSupported = platform === 'win32' || platform === 'darwin';
  return {
    cameraId: value.cameraId,
    microphoneId: value.microphoneId,
    systemAudio: value.systemAudio,
    countdownSeconds: value.countdownSeconds,
    hideTaskbar: desktopSupported && value.hideTaskbar,
    hideDesktopIcons: desktopSupported && value.hideDesktopIcons,
  };
}
module.exports = { regionRecordingSettings };
