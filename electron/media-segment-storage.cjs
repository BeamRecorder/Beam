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

function writeJsonAtomic(file, value, fsModule) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  fsModule.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fsModule.renameSync(temporary, file)
}

function createMediaSegmentStorage({
  kind,
  manifestKey = kind,
  sourcePrefix,
  normalizeFormat,
  fsModule = fs,
  pathModule = path,
}) {
  const sessions = new Map()
  const jobs = new Map()
  const trackName = `${kind[0].toUpperCase()}${kind.slice(1)}`
  const sessionFor = (sessionId) => {
    if (!validId(sessionId)) throw new Error('Invalid capture session.')
    const session = sessions.get(sessionId)
    if (!session) throw new Error(`${trackName} session is not active.`)
    return session
  }
  const jobFor = (ownerId, jobId) => {
    const job = jobs.get(jobId)
    if (!job || job.ownerId !== ownerId) throw new Error(`${trackName} write job was not found or is not authorized.`)
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
  const configure = (session, payload) => {
    if (session.ownerId !== null && session.ownerId !== payload.ownerId)
      throw new Error(`${trackName} session belongs to another renderer.`)
    if (typeof payload.sourceId !== 'string' || !payload.sourceId.startsWith(sourcePrefix))
      throw new Error(`Invalid Chromium ${kind} source.`)
    session.ownerId = payload.ownerId
    session.sourceId = payload.sourceId
    session.format = normalizeFormat(payload.format)
  }

  return {
    registerSession(session) {
      if (!validId(session?.sessionId) || typeof session?.manifestPath !== 'string') return
      sessions.set(session.sessionId, {
        manifestPath: session.manifestPath,
        ownerId: null,
        sourceId: null,
        format: null,
        segments: [],
        metrics: {
          framesAcquired: 0,
          framesEncoded: 0,
          framesReceived: 0,
          framesDropped: 0,
          samplesReceived: 0,
          samplesDropped: 0,
          interruptions: 0,
          configurationChanges: 0,
        },
        failureReason: null,
      })
    },
    forgetSession(sessionId) {
      if (!sessions.has(sessionId)) return
      for (const job of jobs.values()) if (job.sessionId === sessionId) abort(job)
      sessions.delete(sessionId)
    },
    begin(ownerId, payload = {}) {
      const session = sessionFor(payload.sessionId)
      configure(session, { ...payload, ownerId })
      const startNs = requireInteger(payload.startNs, `${trackName} segment start`)
      const directory = pathModule.join(pathModule.dirname(session.manifestPath), kind)
      fsModule.mkdirSync(directory, { recursive: true })
      const number =
        session.segments.length + [...jobs.values()].filter((job) => job.sessionId === payload.sessionId).length + 1
      const targetPath = pathModule.join(directory, `segment-${String(number).padStart(4, '0')}.webm`)
      const temporaryPath = `${targetPath}.${crypto.randomUUID()}.partial`
      const id = crypto.randomUUID()
      const handle = fsModule.openSync(temporaryPath, 'wx')
      jobs.set(id, {
        id,
        ownerId,
        sessionId: payload.sessionId,
        handle,
        targetPath,
        temporaryPath,
        nextSequence: 0,
        position: 0,
        startNs,
      })
      return { jobId: id }
    },
    write(ownerId, payload = {}) {
      const job = jobFor(ownerId, payload.jobId)
      if (!Number.isSafeInteger(payload.sequence) || payload.sequence !== job.nextSequence)
        throw new Error(`Invalid ${kind} chunk sequence.`)
      const data = payload.data
      if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_CHUNK_BYTES)
        throw new Error(`Invalid ${kind} chunk size.`)
      fsModule.writeSync(
        job.handle,
        Buffer.from(data.buffer, data.byteOffset, data.byteLength),
        0,
        data.byteLength,
        job.position,
      )
      job.position += data.byteLength
      job.nextSequence += 1
    },
    finalize(ownerId, payload = {}) {
      const job = jobFor(ownerId, payload.jobId)
      const endNs = requireInteger(payload.endNs, `${trackName} segment end`)
      if (endNs < job.startNs) throw new Error(`${trackName} segment ends before it starts.`)
      const session = sessionFor(job.sessionId)
      fsModule.fsyncSync(job.handle)
      close(job)
      fsModule.renameSync(job.temporaryPath, job.targetPath)
      jobs.delete(job.id)
      session.segments.push({
        segmentId: crypto.randomUUID(),
        path: `${kind}/${pathModule.basename(job.targetPath)}`,
        startNs: job.startNs,
        endNs,
        complete: true,
      })
      const metrics = payload.metrics || {}
      for (const key of Object.keys(session.metrics))
        if (Number.isSafeInteger(metrics[key]) && metrics[key] >= 0) session.metrics[key] += metrics[key]
    },
    fail(ownerId, payload = {}) {
      const session = sessionFor(payload.sessionId)
      if (!session.sourceId) configure(session, { ...payload, ownerId })
      else if (session.ownerId !== null && session.ownerId !== ownerId)
        throw new Error(`${trackName} session belongs to another renderer.`)
      if (typeof payload.reason !== 'string' || !payload.reason.trim())
        throw new Error(`${trackName} failure reason is required.`)
      session.failureReason = payload.reason.trim().slice(0, 500)
      session.metrics.interruptions += 1
    },
    complete(session) {
      const pending = sessions.get(session?.sessionId)
      if (!pending) return session
      for (const job of [...jobs.values()])
        if (job.sessionId === session.sessionId) {
          abort(job)
          pending.failureReason ||= `${trackName} recording did not finalize.`
          pending.metrics.interruptions += 1
        }
      if (!pending.sourceId) {
        sessions.delete(session.sessionId)
        return session
      }
      const manifest = JSON.parse(fsModule.readFileSync(pending.manifestPath, 'utf8'))
      manifest.selectedSources = { ...(manifest.selectedSources || {}), [manifestKey]: pending.sourceId }
      manifest.permissions = { ...(manifest.permissions || {}), [manifestKey]: 'granted' }
      manifest.tracks = (manifest.tracks || []).filter((track) => track?.kind !== kind)
      manifest.tracks.push({
        trackId: crypto.randomUUID(),
        kind,
        sourceId: pending.sourceId,
        format: pending.format,
        segments: pending.segments,
        metrics: pending.metrics,
        status: pending.failureReason ? 'failed' : 'completed',
        terminationReason: pending.failureReason,
      })
      if (pending.failureReason)
        manifest.warnings = [...(manifest.warnings || []), `${trackName} recording failed: ${pending.failureReason}`]
      writeJsonAtomic(pending.manifestPath, manifest, fsModule)
      sessions.delete(session.sessionId)
      return session
    },
    cleanupOwner(ownerId) {
      for (const job of [...jobs.values()]) if (job.ownerId === ownerId) abort(job)
    },
  }
}

function registerMediaSegmentIpc({ ipcMain, storage, channel }) {
  const ownerId = (event) => event.sender.id
  ipcMain.handle(`${channel}:begin-segment`, (event, payload) => storage.begin(ownerId(event), payload))
  ipcMain.handle(`${channel}:write-segment`, (event, payload) => storage.write(ownerId(event), payload))
  ipcMain.handle(`${channel}:finalize-segment`, (event, payload) => storage.finalize(ownerId(event), payload))
  ipcMain.handle(`${channel}:fail`, (event, payload) => storage.fail(ownerId(event), payload))
}

module.exports = { createMediaSegmentStorage, registerMediaSegmentIpc }
