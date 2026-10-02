const { readJsonSync, writeJsonAtomicSync } = require('@beam/storage/node/json-file');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_STATE_SCHEMA = 1;
const UPDATER_CACHE_NAME = 'beam-updater';

function updaterCacheDirectory({
  platform = process.platform,
  environment = process.env,
  homeDirectory = os.homedir(),
} = {}) {
  let baseDirectory;
  if (platform === 'win32') {
    baseDirectory = environment.LOCALAPPDATA || path.join(homeDirectory, 'AppData', 'Local');
  } else if (platform === 'darwin') {
    baseDirectory = path.join(homeDirectory, 'Library', 'Caches');
  } else {
    baseDirectory = environment.XDG_CACHE_HOME || path.join(homeDirectory, '.cache');
  }
  return path.join(baseDirectory, UPDATER_CACHE_NAME);
}

function validState(value) {
  return (
    value &&
    value.schemaVersion === CACHE_STATE_SCHEMA &&
    typeof value.lastSeenVersion === 'string' &&
    (value.pendingVersion === null || typeof value.pendingVersion === 'string')
  );
}

function createUpdateCache({ stateFile, cacheDirectory = updaterCacheDirectory(), fsModule = fs }) {
  const readState = () => {
    try {
      const value = readJsonSync(stateFile, { fsModule });
      return validState(value) ? value : null;
    } catch {
      return null;
    }
  };
  const writeState = (state) => {
    writeJsonAtomicSync(stateFile, state, { fsModule });
  };
  const stateFor = (lastSeenVersion, pendingVersion = null) => ({
    schemaVersion: CACHE_STATE_SCHEMA,
    lastSeenVersion,
    pendingVersion,
  });

  return {
    cleanupForVersion(currentVersion) {
      const state = readState();
      const pendingUpdateAwaitingInstall =
        state?.lastSeenVersion === currentVersion &&
        state.pendingVersion !== null &&
        state.pendingVersion !== currentVersion;
      if (pendingUpdateAwaitingInstall) return false;
      const stateIsCurrent = state?.lastSeenVersion === currentVersion && state.pendingVersion === null;
      if (stateIsCurrent && !fsModule.existsSync(cacheDirectory)) return false;
      fsModule.rmSync(cacheDirectory, { recursive: true, force: true });
      writeState(stateFor(currentVersion));
      return true;
    },
    markDownloaded(currentVersion, targetVersion) {
      writeState(stateFor(currentVersion, targetVersion));
    },
  };
}

module.exports = { createUpdateCache, updaterCacheDirectory };
