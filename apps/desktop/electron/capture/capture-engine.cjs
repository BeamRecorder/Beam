const fs = require('fs');
const path = require('path');
const { NativeCaptureClient } = require('@beam/native-client');
const { resolveCargoTargetDirectory } = require('@beam/native-client/cargo-build-paths');
const {
  captureEngineFilename,
  packagedCaptureEnginePath,
  prebuiltCaptureEnginePath,
} = require('@beam/native-client/capture-engine-path');

/** Desktop resolves its installation and user-data paths; native protocol lifecycle is shared with CLI. */
class CaptureEngine extends NativeCaptureClient {
  constructor(app, applicationRoot, options = {}) {
    super({
      workingDirectory: () => app.getPath('userData'),
      inputHelperPath: options.inputHelperPath,
    });
    this.app = app;
    this.applicationRoot = applicationRoot;
    this.resolveTargetDirectory = options.resolveTargetDirectory || resolveCargoTargetDirectory;
    this.targetDirectory = undefined;
  }
  resolveExecutable() {
    const version = this.app.getVersion();
    const filename = captureEngineFilename(version);
    if (!filename) throw new Error(`Beam has no capture-engine build for ${process.platform}/${process.arch}`);
    const buildFilename = process.platform === 'win32' ? 'capture-engine.exe' : 'capture-engine';
    const bundled = this.app.isPackaged && packagedCaptureEnginePath(process.resourcesPath, version);
    const prebuilt = prebuiltCaptureEnginePath(this.applicationRoot, version);
    const development = [
      path.join(this.applicationRoot, 'target', 'debug', buildFilename),
      path.join(this.applicationRoot, 'target', 'release', buildFilename),
      prebuilt,
    ];
    const candidates = [process.env.BEAM_CAPTURE_ENGINE, ...(bundled ? [bundled] : development)].filter(Boolean);
    let executable = candidates.find((candidate) => fs.existsSync(candidate));
    let cargoError = null;
    if (!executable && !this.app.isPackaged) {
      try {
        this.targetDirectory ??= this.resolveTargetDirectory(this.applicationRoot);
        candidates.push(
          ...['debug', 'release'].map((profile) => path.join(this.targetDirectory, profile, buildFilename)),
        );
        executable = candidates.find((candidate) => fs.existsSync(candidate));
      } catch (error) {
        cargoError = error;
      }
    }
    if (!executable)
      throw new Error(
        `capture-engine ${version} introuvable pour ${process.platform}/${process.arch}. Chemins testés: ${candidates.join(', ')}${cargoError ? `. ${cargoError.message}` : ''}`,
      );
    return executable;
  }
}
module.exports = {
  CaptureEngine,
  TERMINATE_DEADLINE_MS: require('@beam/native-client').TERMINATE_DEADLINE_MS,
};
