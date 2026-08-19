const fs = require('fs');
const path = require('path');
const { packagedInputHelperPath, prebuiltInputHelperPath } = require('../capture/capture-engine-path.cjs');

const INSTALLED_HELPER = '/usr/libexec/beam-input-helper';

class InputAccess {
  constructor({ app, applicationRoot, nativeRequest, platform = process.platform }) {
    this.app = app;
    this.applicationRoot = applicationRoot;
    this.nativeRequest = nativeRequest;
    this.platform = platform;
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
      return await this.nativeRequest('input-access-status');
    } catch {
      return unavailableStatus();
    }
  }

  async request() {
    if (this.platform === 'linux' && !this.helperForCapture()) return unavailableStatus('input-helper-unavailable');
    return this.nativeRequest('request-input-access');
  }

  installedHelper() {
    return executable(INSTALLED_HELPER) ? INSTALLED_HELPER : null;
  }

  bundledHelper() {
    const version = this.app.getVersion();
    const candidates = this.app.isPackaged
      ? [packagedInputHelperPath(process.resourcesPath, version, this.platform)]
      : [
          path.join(this.applicationRoot, 'target', 'debug', 'beam-input-helper'),
          path.join(this.applicationRoot, 'target', 'release', 'beam-input-helper'),
          prebuiltInputHelperPath(this.applicationRoot, version, this.platform),
        ];
    return candidates.filter(Boolean).find(executable) || null;
  }
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

function registerInputAccessIpc(ipcMain, inputAccess) {
  ipcMain.handle('input-access:status', () => inputAccess.status());
  ipcMain.handle('input-access:request', () => inputAccess.request());
}

module.exports = { InputAccess, registerInputAccessIpc };
