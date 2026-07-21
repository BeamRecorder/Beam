const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MAX_CHUNK_BYTES = 32 * 1024 * 1024

function validId(value) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
}

function requireInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`)
  return value
}

function requireFormat(value) {
  if (!value || typeof value !== 'object' || typeof value.codec !== 'string') throw new Error('Invalid camera format.')
  return {
    mediaType: 'video', codec: value.codec,
    width: requireInteger(value.width, 'Camera width'),
    height: requireInteger(value.height, 'Camera height'),
    nominalFps: requireInteger(value.nominalFps, 'Camera fps'),
  }
}

function writeJsonAtomic(file, value, fsModule) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  fsModule.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fsModule.renameSync(temporary, file)
}

function createCameraStorage({ fsModule = fs, pathModule = path }) {
  const sessions = new Map()
  const jobs = new Map()

  const sessionFor = (sessionId) => {
    if (!validId(sessionId)) throw new Error('Invalid capture session.')
    const session = sessions.get(sessionId)
    if (!session) throw new Error('Camera session is not active.')
    return session
  }
  const jobFor = (ownerId, jobId) => {
    const job = jobs.get(jobId)
    if (!job || job.ownerId !== ownerId) throw new Error('Camera write job was not found or is not authorized.')
    return job
  }
  const close = (job) => {
    if (job.handle !== null) fsModule.closeSync(job.handle)
    job.handle = null
  }
  const abort = (job) => {
    close(job)
    if (fsModule.existsSync(job.temporaryPath)) fsModule.unlinkSync(job.temporaryPath)
    jobs.delete(job.id)
  }

  return {
    registerSession(session) {
      if (!validId(session?.sessionId) || typeof session?.manifestPath !== 'string') return
      sessions.set(session.sessionId, { manifestPath: session.manifestPath, ownerId: null, sourceId: null, format: null, segments: [], metrics: { framesAcquired: 0, framesEncoded: 0, framesReceived: 0, framesDropped: 0, samplesReceived: 0, samplesDropped: 0, interruptions: 0, configurationChanges: 0 }, failureReason: null })
    },
    forgetSession(sessionId) {
      const session = sessions.get(sessionId)
      if (!session) return
      for (const job of jobs.values()) if (job.sessionId === sessionId) abort(job)
      sessions.delete(sessionId)
    },
    begin(ownerId, payload = {}) {
      const session = sessionFor(payload.sessionId)
      if (session.ownerId !== null && session.ownerId !== ownerId) throw new Error('Camera session belongs to another renderer.')
      if (typeof payload.sourceId !== 'string' || !payload.sourceId.startsWith('camera:chromium:')) throw new Error('Invalid Chromium camera source.')
      const format = requireFormat(payload.format)
      const startNs = requireInteger(payload.startNs, 'Camera segment start')
      const directory = pathModule.join(pathModule.dirname(session.manifestPath), 'camera')
      fsModule.mkdirSync(directory, { recursive: true })
      const number = session.segments.length + [...jobs.values()].filter((job) => job.sessionId === payload.sessionId).length + 1
      const filename = `segment-${String(number).padStart(4, '0')}.webm`
      const targetPath = pathModule.join(directory, filename)
      const temporaryPath = `${targetPath}.${crypto.randomUUID()}.partial`
      const id = crypto.randomUUID()
      const handle = fsModule.openSync(temporaryPath, 'wx')
      session.ownerId = ownerId
      session.sourceId = payload.sourceId
      session.format = format
      jobs.set(id, { id, ownerId, sessionId: payload.sessionId, handle, targetPath, temporaryPath, nextSequence: 0, position: 0, startNs })
      return { jobId: id }
    },
    write(ownerId, payload = {}) {
      const job = jobFor(ownerId, payload.jobId)
      if (!Number.isSafeInteger(payload.sequence) || payload.sequence !== job.nextSequence) throw new Error('Invalid camera chunk sequence.')
      const data = payload.data
      if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_CHUNK_BYTES) throw new Error('Invalid camera chunk size.')
      fsModule.writeSync(job.handle, Buffer.from(data.buffer, data.byteOffset, data.byteLength), 0, data.byteLength, job.position)
      job.position += data.byteLength
      job.nextSequence += 1
    },
    finalize(ownerId, payload = {}) {
      const job = jobFor(ownerId, payload.jobId)
      const endNs = requireInteger(payload.endNs, 'Camera segment end')
      if (endNs < job.startNs) throw new Error('Camera segment ends before it starts.')
      const session = sessionFor(job.sessionId)
      fsModule.fsyncSync(job.handle)
      close(job)
      fsModule.renameSync(job.temporaryPath, job.targetPath)
      jobs.delete(job.id)
      session.segments.push({ segmentId: crypto.randomUUID(), path: `camera/${pathModule.basename(job.targetPath)}`, startNs: job.startNs, endNs, complete: true })
      const metrics = payload.metrics || {}
      for (const key of Object.keys(session.metrics)) if (Number.isSafeInteger(metrics[key]) && metrics[key] >= 0) session.metrics[key] += metrics[key]
    },
    fail(ownerId, payload = {}) {
      const session = sessionFor(payload.sessionId)
      if (session.ownerId !== null && session.ownerId !== ownerId) throw new Error('Camera session belongs to another renderer.')
      if (typeof payload.reason !== 'string' || !payload.reason.trim()) throw new Error('Camera failure reason is required.')
      session.ownerId = ownerId
      session.failureReason = payload.reason.trim().slice(0, 500)
      session.metrics.interruptions += 1
    },
    complete(session) {
      const pending = sessions.get(session?.sessionId)
      if (!pending) return session
      for (const job of [...jobs.values()]) if (job.sessionId === session.sessionId) {
        abort(job)
        pending.failureReason ||= 'Camera recording did not finalize.'
        pending.metrics.interruptions += 1
      }
      if (!pending.sourceId) {
        sessions.delete(session.sessionId)
        return session
      }
      const manifest = JSON.parse(fsModule.readFileSync(pending.manifestPath, 'utf8'))
      manifest.selectedSources = { ...(manifest.selectedSources || {}), camera: pending.sourceId }
      manifest.permissions = { ...(manifest.permissions || {}), camera: 'granted' }
      manifest.tracks = (manifest.tracks || []).filter((track) => track?.kind !== 'camera')
      manifest.tracks.push({ trackId: crypto.randomUUID(), kind: 'camera', sourceId: pending.sourceId, format: pending.format, segments: pending.segments, metrics: pending.metrics, status: pending.failureReason ? 'failed' : 'completed', terminationReason: pending.failureReason })
      if (pending.failureReason) manifest.warnings = [...(manifest.warnings || []), `Camera recording failed: ${pending.failureReason}`]
      writeJsonAtomic(pending.manifestPath, manifest, fsModule)
      sessions.delete(session.sessionId)
      return session
    },
    cleanupOwner(ownerId) {
      for (const job of [...jobs.values()]) if (job.ownerId === ownerId) abort(job)
    },
  }
}

function registerCameraIpc({ ipcMain, storage }) {
  const ownerId = (event) => event.sender.id
  ipcMain.handle('camera:begin-segment', (event, payload) => storage.begin(ownerId(event), payload))
  ipcMain.handle('camera:write-segment', (event, payload) => storage.write(ownerId(event), payload))
  ipcMain.handle('camera:finalize-segment', (event, payload) => storage.finalize(ownerId(event), payload))
  ipcMain.handle('camera:fail', (event, payload) => storage.fail(ownerId(event), payload))
}

module.exports = { createCameraStorage, registerCameraIpc }
