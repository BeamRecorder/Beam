const { spawn } = require('child_process')
const { randomUUID } = require('crypto')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const REQUEST_TIMEOUT_MS = 30_000

class CaptureEngine {
  constructor(app, applicationRoot) {
    this.app = app
    this.applicationRoot = applicationRoot
    this.process = null
    this.pending = new Map()
    this.stderr = []
  }

  resolveExecutable() {
    const filename = process.platform === 'win32' ? 'capture-engine.exe' : 'capture-engine'
    const candidates = [process.env.DEMO_RECORDER_CAPTURE_ENGINE, this.app.isPackaged && path.join(process.resourcesPath, 'capture-engine', filename), path.join(this.applicationRoot, 'target', 'release', filename), path.join(this.applicationRoot, 'target', 'debug', filename)].filter(Boolean)
    const executable = candidates.find((candidate) => fs.existsSync(candidate))
    if (!executable) throw new Error(`capture-engine introuvable. Exécutez "cargo build -p capture --bin capture-engine" ou définissez DEMO_RECORDER_CAPTURE_ENGINE. Chemins testés: ${candidates.join(', ')}`)
    return executable
  }

  ensureStarted() {
    if (this.process && !this.process.killed) return
    const child = spawn(this.resolveExecutable(), [], { cwd: this.app.getPath('userData'), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.process = child
    this.stderr = []
    readline.createInterface({ input: child.stdout }).on('line', (line) => this.handleResponse(line))
    readline.createInterface({ input: child.stderr }).on('line', (line) => { this.stderr.push(line); if (this.stderr.length > 20) this.stderr.shift() })
    child.once('error', (error) => this.failAll(error))
    child.once('exit', (code, signal) => {
      this.failAll(new Error(`capture-engine arrêté (code=${code}, signal=${signal}).${this.stderr.length ? `\n${this.stderr.join('\n')}` : ''}`))
      if (this.process === child) this.process = null
    })
  }

  handleResponse(line) {
    let response
    try { response = JSON.parse(line) } catch (error) { this.failAll(new Error(`Réponse invalide de capture-engine: ${error.message}`)); return }
    const pending = this.pending.get(response.requestId)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.pending.delete(response.requestId)
    if (response.ok) pending.resolve(response.result)
    else { const error = new Error(response.error?.message || 'Erreur de capture inconnue'); error.code = response.error?.code || 'capture-error'; pending.reject(error) }
  }

  request(command, payload = {}) {
    this.ensureStarted()
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`Délai dépassé pour la commande de capture "${command}"`)) }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timeout })
      this.process.stdin.write(`${JSON.stringify({ id, command, ...payload })}\n`, (error) => {
        if (!error) return
        clearTimeout(timeout); this.pending.delete(id); reject(error)
      })
    })
  }

  failAll(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(error) }; this.pending.clear() }

  async shutdown() {
    const child = this.process
    if (!child) return
    try { await this.request('status'); await this.request('stop') } catch {}
    child.stdin.end()
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve()
      const timeout = setTimeout(() => { if (this.process === child && !child.killed) child.kill(); resolve() }, 2_000)
      child.once('exit', () => { clearTimeout(timeout); resolve() })
    })
  }
}

module.exports = { CaptureEngine }
