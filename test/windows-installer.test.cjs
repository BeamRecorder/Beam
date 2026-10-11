const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { CancellationToken } = require('builder-util-runtime');
// Initialize the builder's public entry before its mutually dependent target modules.
require('app-builder-lib');
const { validateConfiguration } = require('app-builder-lib/out/util/config/config');
const { NsisTarget } = require('app-builder-lib/out/targets/nsis/NsisTarget');
const { LangConfigurator, createAddLangsMacro } = require('app-builder-lib/out/targets/nsis/nsisLang');
const { NsisScriptGenerator } = require('app-builder-lib/out/targets/nsis/nsisScriptGenerator');
const { NsisUpdater } = require('electron-updater/out/NsisUpdater');
const { createAutoUpdater } = require('../apps/desktop/electron/updates/auto-updater.cjs');
const metadata = require('../package.json');

function installerTarget(options = metadata.build.nsis) {
  const packager = {
    config: { ...metadata.build, nsis: options },
    info: { metadata, cancellationToken: new CancellationToken() },
    appInfo: { sanitizedProductName: metadata.build.productName },
    getResource: async () => null,
    expandMacro: (value) =>
      value.replaceAll('${productName}', metadata.build.productName).replaceAll('${version}', metadata.version),
  };
  return new NsisTarget(packager, '.', 'nsis', { refCount: 0 });
}

test('the installed electron-builder accepts the complete production packaging configuration', async () => {
  await validateConfiguration(metadata.build, { isEnabled: false });
});

test('the effective Windows installer enables folder selection without losing universal or differential updates', async () => {
  const target = installerTarget();
  const defines = {};
  await target.configureDefines(target.options.oneClick !== false, defines);

  assert.ok(Object.hasOwn(defines, 'allowToChangeInstallationDirectory'));
  assert.ok(!Object.hasOwn(defines, 'ONE_CLICK'));
  assert.ok(!Object.hasOwn(defines, 'INSTALL_MODE_PER_ALL_USERS'));
  assert.ok(Object.hasOwn(defines, 'MULTIUSER_INSTALLMODE_ALLOW_ELEVATION'));
  assert.ok(!Object.hasOwn(defines, 'DELETE_APP_DATA_ON_UNINSTALL'));
  assert.equal(target.shouldBuildUniversalInstaller, true);
  assert.equal(target.isBuildDifferentialAware, true);
});

test('electron-builder rejects enabling folder selection in the one-click installer', async () => {
  const target = installerTarget({ ...metadata.build.nsis, oneClick: true, allowToChangeInstallationDirectory: true });
  await assert.rejects(async () => target.configureDefines(true, {}), /only for assisted installer/);
});

test('the native folder page retains the existing detected installer languages', () => {
  const languages = new LangConfigurator(metadata.build.nsis);
  const script = new NsisScriptGenerator();
  createAddLangsMacro(script, languages);

  assert.equal(languages.isMultiLang, true);
  for (const language of ['en_US', 'fr_FR', 'de_DE', 'vi_VN', 'zh_CN', 'zh_TW']) {
    assert.ok(languages.langs.includes(language), `${language} remains available`);
  }
  assert.match(script.build(), /MUI_LANGUAGE "French"/);
  assert.match(script.build(), /MUI_LANGUAGE "Vietnamese"/);
  assert.doesNotMatch(script.build(), /undefined/);
});

test('Restart now uses the real NSIS silent update path and relaunches without overriding the installed folder', async () => {
  const launches = [];
  const nativeUpdater = {
    installerPath: 'C:\\Users\\Beam\\Downloads\\Beam-Setup.exe',
    installDirectory: null,
    downloadedUpdateHelper: null,
    spawnLog: async (file, args) => launches.push({ file, args }),
    dispatchError: (error) => assert.fail(error.message),
  };
  const autoUpdater = new EventEmitter();
  autoUpdater.quitAndInstall = (isSilent, isForceRunAfter) =>
    NsisUpdater.prototype.doInstall.call(nativeUpdater, { isSilent, isForceRunAfter, isAdminRightsRequired: false });
  const updater = createAutoUpdater({
    app: { isPackaged: true, getVersion: () => metadata.version },
    BrowserWindow: { getAllWindows: () => [] },
    autoUpdater,
    openExternal: async () => undefined,
  });

  assert.equal(await updater.quitAndInstall(), false);
  assert.deepEqual(launches, []);
  autoUpdater.emit('update-downloaded', { version: '99.0.0' });
  assert.equal(await updater.quitAndInstall(), true);
  assert.deepEqual(launches, [{ file: nativeUpdater.installerPath, args: ['--updated', '/S', '--force-run'] }]);
});
