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
const TERMINATE_DEADLINE_MS = 1_000;
const HARD_KILL_CONFIRMATION_MS = 2_000;

class CaptureEngine {
  constructor(app, applicationRoot, options = {}) {
    this.app = app;
    this.applicationRoot = applicationRoot;
    this.process = null;
    this.pending = new Map();
    this.stderr = [];
    this.inputHelperPath = options.inputHelperPath || (() => null);
    this.state = 'stopped'; // stopped | running | poisoned | terminating | shutdown
    this.shuttingDown = false;
    this.terminating = null;
    this.unconfirmedExit = null;
    this.stdoutReader = null;
    this.stderrReader = null;
    this.shutdownPromise = null;
  }

  get isPoisoned() {
    return this.state === 'poisoned' || this.state === 'terminating' || this.unconfirmedExit !== null;
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
    const executable = candidates.find((candidate) => fs.existsSync(candidate));
    if (!executable)
      throw new Error(
        `capture-engine ${version} introuvable pour ${process.platform}/${process.arch}. Chemins testés: ${candidates.join(', ')}`,
      );
    return executable;
  }

  ensureStarted() {
    if (this.terminating) throw new Error('capture-engine: the previous process is still terminating');
    if (this.unconfirmedExit)
      throw new Error(`capture-engine: previous process exit was not confirmed (${this.unconfirmedExit.reason})`);
    if (this.process && !this.process.killed) return;
    if (this.shuttingDown) throw new Error('capture-engine: respawn is disabled during application shutdown');
    const child = spawn(this.resolveExecutable(), [], {
      cwd: this.app.getPath('userData'),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        BEAM_PARENT_PID: String(process.pid),
        BEAM_INSTANCE_TOKEN: process.env.BEAM_INSTANCE_TOKEN || '',
        ...(this.inputHelperPath() ? { BEAM_INPUT_HELPER_PATH: this.inputHelperPath() } : {}),
      },
    });
    this.process = child;
    this.state = 'running';
    this.unconfirmedExit = null;
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
      void this.terminateProcess(error);
    });
    child.once('exit', (code, signal) => {
      if (this.process !== child) return;
      void this.terminateProcess(
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
      // Malformed protocol output is an uncertain engine: poison and terminate
      // it rather than continuing to talk to a possibly corrupted child.
      void this.terminateProcess(new Error(`Réponse invalide de capture-engine: ${error.message}`));
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
    if (this.terminating) {
      const termination = this.terminating.promise;
      return termination.then((result) => {
        if (!result.confirmed)
          throw new Error(`capture-engine: previous process exit was not confirmed (${result.reason})`);
        return this.request(command, payload, options);
      });
    }
    if (this.shuttingDown && options.allowDuringShutdown !== true)
      return Promise.reject(new Error('capture-engine: requests are disabled during application shutdown'));
    this.ensureStarted();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const interactive = ['prepare', 'start', 'request-input-access'].includes(command);
      const timeoutMs = options.timeoutMs ?? (interactive ? INTERACTIVE_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
      const timeout = setTimeout(() => {
        void this.terminateProcess(new Error(`Délai dépassé pour la commande de capture "${command}"`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.process.stdin.write(`${JSON.stringify({ id, command, ...payload })}\n`, (error) => {
        if (!error) return;
        void this.terminateProcess(error);
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

  // Terminate the exact child and resolve only after its exit is observed or
  // the escalation deadline expires. The child handle is retained locally so
  // old child events can never affect a replacement child.
  terminateProcess(reason, { force = false } = {}) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    this.failAll(error);
    if (this.terminating) {
      if (force) this.terminating.force();
      return this.terminating.promise;
    }
    const child = this.process;
    this.closeReaders();
    if (this.state !== 'shutdown') this.state = 'terminating';
    if (!child) return Promise.resolve({ confirmed: false, reason: error.message });
    const exit = this.awaitExit(child, error);
    const promise = exit.promise.then((result) => {
      if (this.terminating?.child === child) this.terminating = null;
      if (this.process === child) this.process = null;
      if (!result.confirmed) this.unconfirmedExit = result;
      if (this.state !== 'shutdown') this.state = 'poisoned';
      return result;
    });
    this.terminating = { child, force: exit.force, promise };
    if (force) exit.force();
    return promise;
  }

  awaitExit(child, reason) {
    if (child.exitCode !== null || child.signalCode) {
      return { force: () => {}, promise: Promise.resolve({ confirmed: true, reason: reason.message }) };
    }
    let force = () => {};
    const promise = new Promise((resolve) => {
      let settled = false;
      let escalation = null;
      let confirmation = null;
      let forceStarted = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (escalation) clearTimeout(escalation);
        if (confirmation) clearTimeout(confirmation);
        resolve(result);
      };
      const hardKill = () => {
        if (settled || forceStarted) return;
        forceStarted = true;
        try {
          const sent = child.kill('SIGKILL');
          if (!sent) {
            finish({ confirmed: false, reason: reason.message, killError: 'hard kill returned false' });
            return;
          }
          // Give the exit event a short confirmation window after SIGKILL.
          confirmation = setTimeout(
            () => finish({ confirmed: false, reason: reason.message, hardKilled: true }),
            HARD_KILL_CONFIRMATION_MS,
          );
        } catch (killError) {
          finish({ confirmed: false, reason: reason.message, killError: String(killError) });
        }
      };
      force = hardKill;
      escalation = setTimeout(hardKill, TERMINATE_DEADLINE_MS);
      child.once('exit', () => finish({ confirmed: true, reason: reason.message }));
      try {
        child.stdin.end();
      } catch {
        // stdin already closed; the child is still terminated below.
      }
    });
    return { force: () => force(), promise };
  }

  async shutdown() {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  async performShutdown() {
    // Disable respawn before the graceful stop so a concurrent request can
    // never spawn a fresh engine once application shutdown has begun.
    this.shuttingDown = true;
    const child = this.process;
    if (!child) {
      this.state = 'shutdown';
      return;
    }
    try {
      await this.request('stop', {}, { timeoutMs: 2_000, allowDuringShutdown: true });
    } catch {
      // Graceful stop failed or timed out; the process is force-killed below.
    }
    await this.terminateProcess(new Error('capture-engine shutdown'));
    this.state = 'shutdown';
  }

  forceShutdown() {
    this.shuttingDown = true;
    if (this.terminating) {
      this.state = 'shutdown';
      return this.terminateProcess(new Error('capture-engine force shutdown'), { force: true });
    }
    const child = this.process;
    if (!child) {
      this.state = 'shutdown';
      return Promise.resolve({ confirmed: false, reason: 'no capture-engine process' });
    }
    this.state = 'shutdown';
    return this.terminateProcess(new Error('capture-engine force shutdown'), { force: true });
  }
}

module.exports = { CaptureEngine, TERMINATE_DEADLINE_MS };
