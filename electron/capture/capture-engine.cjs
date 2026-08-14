const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  captureEngineFilename,
  packagedCaptureEnginePath,
  prebuiltCaptureEnginePath,
} = require('./capture-engine-path.cjs');

const REQUEST_TIMEOUT_MS = 30_000;
const INTERACTIVE_REQUEST_TIMEOUT_MS = 120_000;

class CaptureEngine {
  constructor(app, applicationRoot, options = {}) {
    this.app = app;
    this.applicationRoot = applicationRoot;
    this.process = null;
    this.pending = new Map();
    this.stderr = [];
    this.inputHelperPath = options.inputHelperPath || (() => null);
    this.poisoned = false;
    this.stdoutReader = null;
    this.stderrReader = null;
    this.shutdownPromise = null;
  }

  get isPoisoned() {
    return this.poisoned;
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
    const candidates = [process.env.DEMO_RECORDER_CAPTURE_ENGINE, ...(bundled ? [bundled] : development)].filter(
      Boolean,
    );
    const executable = candidates.find((candidate) => fs.existsSync(candidate));
    if (!executable)
      throw new Error(
        `capture-engine ${version} introuvable pour ${process.platform}/${process.arch}. Chemins testés: ${candidates.join(', ')}`,
      );
    return executable;
  }

  ensureStarted() {
    if (this.process && !this.process.killed) return;
    const child = spawn(this.resolveExecutable(), [], {
      cwd: this.app.getPath('userData'),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        ...(this.inputHelperPath() ? { BEAM_INPUT_HELPER_PATH: this.inputHelperPath() } : {}),
      },
    });
    this.process = child;
    this.poisoned = false;
    this.stderr = [];
    this.stdoutReader = readline
      .createInterface({ input: child.stdout })
      .on('line', (line) => this.handleResponse(line));
    this.stderrReader = readline.createInterface({ input: child.stderr }).on('line', (line) => {
      this.stderr.push(line);
      if (this.stderr.length > 20) this.stderr.shift();
    });
    child.once('error', (error) => {
      if (this.process !== child) return;
      this.terminateProcess(error);
    });
    child.once('exit', (code, signal) => {
      if (this.process !== child) return;
      this.terminateProcess(
        new Error(
          `capture-engine arrêté (code=${code}, signal=${signal}).${this.stderr.length ? `\n${this.stderr.join('\n')}` : ''}`,
        ),
      );
    });
  }

  handleResponse(line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch (error) {
      this.failAll(new Error(`Réponse invalide de capture-engine: ${error.message}`));
      return;
    }
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(response.requestId);
    if (response.ok) pending.resolve(response.result);
    else {
      const error = new Error(response.error?.message || 'Erreur de capture inconnue');
      error.code = response.error?.code || 'capture-error';
      pending.reject(error);
    }
  }

  request(command, payload = {}, options = {}) {
    this.ensureStarted();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const interactive = ['prepare', 'start', 'request-input-access'].includes(command);
      const timeoutMs = options.timeoutMs ?? (interactive ? INTERACTIVE_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
      const timeout = setTimeout(() => {
        this.terminateProcess(new Error(`Délai dépassé pour la commande de capture "${command}"`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.process.stdin.write(`${JSON.stringify({ id, command, ...payload })}\n`, (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  closeReaders() {
    if (this.stdoutReader) {
      this.stdoutReader.close();
      this.stdoutReader = null;
    }
    if (this.stderrReader) {
      this.stderrReader.close();
      this.stderrReader = null;
    }
  }

  terminateProcess(reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    this.poisoned = true;
    this.failAll(error);
    const child = this.process;
    this.process = null;
    this.closeReaders();
    if (child) {
      try {
        child.stdin.end();
      } catch {}
      try {
        child.kill();
      } catch {}
    }
  }

  async shutdown() {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  async performShutdown() {
    const child = this.process;
    if (!child) return;
    try {
      await this.request('stop', {}, { timeoutMs: 2_000 });
    } catch {
      // Graceful stop failed or timed out; the process is force-killed below.
    }
    this.terminateProcess(new Error('capture-engine shutdown'));
  }
}

module.exports = { CaptureEngine };
