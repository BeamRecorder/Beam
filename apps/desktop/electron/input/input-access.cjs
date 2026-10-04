const fs = require('fs');
const path = require('path');
const { resolveCargoTargetDirectory } = require('@beam/native-client/cargo-build-paths');
const { packagedInputHelperPath, prebuiltInputHelperPath } = require('@beam/native-client/capture-engine-path');
const { createInputAccessPreferenceWriter } = require('./input-access-preferences.cjs');

const INSTALLED_HELPER = '/usr/libexec/beam-input-helper';

class InputAccess {
  constructor({
    app,
    applicationRoot,
    nativeRequest,
    platform = process.platform,
    resolveTargetDirectory = resolveCargoTargetDirectory,
  }) {
    this.app = app;
    this.applicationRoot = applicationRoot;
    this.nativeRequest = nativeRequest;
    this.platform = platform;
    this.lastError = null;
    this.resolveTargetDirectory = resolveTargetDirectory;
    this.targetDirectory = undefined;
    this.pendingRequest = null;
    this.onAvailable = null;
  }

  helperForCapture() {
    if (this.platform !== 'linux') return null;
    // Keep the bundled path available to the native broker so an explicit
    // authorization can install or update the privileged system copy.
    return this.bundledHelper() || this.installedHelper();
  }

  async status() {
    if (this.platform === 'linux' && !this.helperForCapture()) return unavailableStatus('input-helper-unavailable');
    try {
      const status = await this.nativeRequest('input-access-status');
      if (status.state === 'available') this.lastError = null;
      return status.error || !this.lastError ? status : { ...status, error: this.lastError };
    } catch (error) {
      this.lastError = accessError(error);
      return { ...unavailableStatus(), error: this.lastError };
    }
  }

  request() {
    if (this.pendingRequest) return this.pendingRequest;
    const promise = this.requestNativeAccess();
    this.pendingRequest = promise;
    const clear = () => {
      if (this.pendingRequest === promise) this.pendingRequest = null;
    };
    void promise.then(clear, clear);
    return promise;
  }

  async requestNativeAccess() {
    this.lastError = null;
    if (this.platform === 'linux' && !this.helperForCapture()) return unavailableStatus('input-helper-unavailable');
    try {
      const status = await this.nativeRequest('request-input-access');
      if (status.state === 'available') await this.onAvailable?.();
      return status;
    } catch (error) {
      this.lastError = accessError(error);
      throw error;
    }
  }

  async ensureReady(cursor) {
    let status = await this.status();
    if (status.state !== 'available' && status.canRequest) status = await this.request();
    if (status.state !== 'available') {
      const cancelled = !status.error && ['permission-required', 'installation-required'].includes(status.state);
      const error = new Error(
        status.error?.message || 'Linux input access is required to record clicks and shortcuts.',
      );
      error.code = cancelled ? 'cancelled' : status.error?.code || 'input-access-unavailable';
      throw error;
    }
    if ((cursor.captureClicks && !status.clicks) || (cursor.captureShortcuts && !status.shortcuts)) {
      const error = new Error('The Linux input helper could not access the required mouse or keyboard devices.');
      error.code = 'input-devices-unavailable';
      throw error;
    }
  }

  installedHelper() {
    return executable(INSTALLED_HELPER) ? INSTALLED_HELPER : null;
  }

  bundledHelper() {
    const version = this.app.getVersion();
    const candidates = this.app.isPackaged
      ? [packagedInputHelperPath(process.resourcesPath, version, this.platform)]
      : [
          ...(process.env.BEAM_CAPTURE_ENGINE
            ? [path.join(path.dirname(process.env.BEAM_CAPTURE_ENGINE), 'beam-input-helper')]
            : []),
          path.join(this.applicationRoot, 'target', 'debug', 'beam-input-helper'),
          path.join(this.applicationRoot, 'target', 'release', 'beam-input-helper'),
          prebuiltInputHelperPath(this.applicationRoot, version, this.platform),
        ];
    const helper = candidates.filter(Boolean).find(executable);
    if (helper || this.app.isPackaged) return helper || null;
    try {
      this.targetDirectory ??= this.resolveTargetDirectory(this.applicationRoot);
      return (
        ['debug', 'release']
          .map((profile) => path.join(this.targetDirectory, profile, 'beam-input-helper'))
          .find(executable) || null
      );
    } catch {
      return null;
    }
  }
}

function accessError(error) {
  return {
    code: typeof error?.code === 'string' ? error.code.slice(0, 4096) : 'input-broker-unavailable',
    message: (error instanceof Error ? error.message : 'Input access failed.').slice(0, 4096),
  };
}

function unavailableStatus(unavailableReason = 'input-broker-unavailable') {
  return {
    state: 'unavailable',
    canRequest: false,
    clicks: false,
    shortcuts: false,
    recordsText: false,
    unavailableReason,
  };
}

function executable(candidate) {
  try {
    const stats = fs.statSync(candidate);
    return stats.isFile() && (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function registerInputAccessIpc(ipcMain, inputAccess, { store, BrowserWindow }) {
  inputAccess.onAvailable = createInputAccessPreferenceWriter({ store, BrowserWindow });
  ipcMain.handle('input-access:status', () => inputAccess.status());
  ipcMain.handle('input-access:request', () => inputAccess.request());
}

module.exports = { InputAccess, registerInputAccessIpc };
