const schema = JSON.parse(globalThis.__arguiContractJson)
const formatLogValue = (value) => {
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) ?? String(value) }
  catch { return String(value) }
}
globalThis.console = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level =>
  [level, (...values) => {
    if (level === 'error' && values.length && values.every(value => value instanceof Error && (value.code === 'closed' || value.code === 'cancelled'))) return
    globalThis.__arguiLog(level, values.map(formatLogValue).join(' '))
  }]))
globalThis.__arguiNativeEffects = []
let subscriber = null
let profileSubscriber = null
const serviceSubscribers = new Set()
const themeSubscribers = new Map()
let nextTimer = 1
const timers = new Map()

globalThis.__arguiMicrotaskError = null
globalThis.queueMicrotask = (callback) => Promise.resolve().then(() => {
  try { callback() }
  catch (error) {
    globalThis.__arguiMicrotaskError = error instanceof Error
      ? `${error.message}\n${error.stack ?? ''}` : String(error)
  }
})
globalThis.AbortController ??= class AbortController {
  constructor() {
    const listeners = new Set()
    this.signal = {
      aborted: false,
      addEventListener: (type, listener) => {
        if (type === 'abort' && typeof listener === 'function') listeners.add(listener)
      },
      removeEventListener: (type, listener) => {
        if (type === 'abort') listeners.delete(listener)
      },
    }
    this.abort = () => {
      if (this.signal.aborted) return
      this.signal.aborted = true
      for (const listener of listeners) listener()
      listeners.clear()
    }
  }
}
const scheduleTimer = (callback, delay, repeat) => {
  const id = nextTimer++
  timers.set(id, { callback, delay: Math.max(1, Number(delay) || 0), due: 0, repeat })
  return id
}
globalThis.setInterval = (callback, delay) => scheduleTimer(callback, delay, true)
globalThis.setTimeout = (callback, delay) => scheduleTimer(callback, delay, false)
globalThis.clearInterval = (id) => { timers.delete(id) }
globalThis.clearTimeout = globalThis.clearInterval
globalThis.__arguiNextTimer = (now) => {
  let remaining = Infinity
  for (const timer of timers.values()) {
    if (timer.due === 0) timer.due = now + timer.delay
    remaining = Math.min(remaining, Math.max(0, timer.due - now))
  }
  return Number.isFinite(remaining) ? remaining : null
}
globalThis.__arguiTick = (now) => {
  for (const [id, timer] of timers) {
    if (timer.due === 0) timer.due = now + timer.delay
    if (now < timer.due) continue
    if (timer.repeat) timer.due = now + timer.delay
    else timers.delete(id)
    timer.callback()
  }
}
globalThis.__arguiDeliver = (json) => { subscriber?.(JSON.parse(json)) }
globalThis.__arguiDeliverProfile = (json) => { profileSubscriber?.(JSON.parse(json)) }
globalThis.__arguiDeliverService = (json) => {
  const response = JSON.parse(json)
  for (const subscriber of serviceSubscribers) subscriber(response)
}
globalThis.__arguiDeliverTheme = (id, json) => {
  for (const subscriber of themeSubscribers.get(id) ?? []) subscriber(JSON.parse(json))
}
const themeResponse = (json) => {
  const response = JSON.parse(json)
  if (response.error) throw new Error(response.error)
  return response
}
const i18nResponse = (json) => {
  const response = JSON.parse(json)
  if (response.error) throw new Error(response.error)
  return response
}
globalThis.__arguiBridge = {
  contract: () => schema,
  commit: (operations) => {
    const error = globalThis.__arguiSend(JSON.stringify(operations.map((op) => {
      switch (op.kind) {
        case 'create': return [0, op.id.slot, op.id.generation, op.nativeType]
        case 'setProperty': return [1, op.id.slot, op.id.generation, op.property, op.value?.type ?? null, op.value?.value ?? null]
        case 'setListener': return [2, op.id.slot, op.id.generation, op.event, op.callback]
        case 'insert': return [3, op.parent.slot, op.parent.generation, op.child.slot, op.child.generation, op.before?.slot ?? null, op.before?.generation ?? null]
        case 'remove': return [4, op.id.slot, op.id.generation]
        case 'setRoot': return [5, op.id?.slot ?? null, op.id?.generation ?? null]
        default: throw new Error(`Unknown native operation: ${op.kind}`)
      }
    })))
    if (error) throw new Error(error)
  },
  subscribe: (callback) => {
    subscriber = callback
    return () => { if (subscriber === callback) subscriber = null }
  },
  request: (request) => {
    const error = globalThis.__arguiService(JSON.stringify(request))
    if (error) throw new Error(error)
  },
  cancelRequest: (window, requestId) => {
    const error = globalThis.__arguiCancelService(JSON.stringify({ window, requestId }))
    if (error) throw new Error(error)
  },
  subscribeResponses: (callback) => {
    serviceSubscribers.add(callback)
    return () => { serviceSubscribers.delete(callback) }
  },
  theme: {
    create: (definition) => themeResponse(globalThis.__arguiThemeCreate(JSON.stringify(definition))),
    update: (id, patch) => themeResponse(globalThis.__arguiThemeUpdate(id, JSON.stringify(patch))),
    subscribe: (id, callback) => {
      let subscribers = themeSubscribers.get(id)
      if (!subscribers) {
        subscribers = new Set()
        themeSubscribers.set(id, subscribers)
      }
      subscribers.add(callback)
      return () => {
        subscribers.delete(callback)
        if (subscribers.size === 0) themeSubscribers.delete(id)
      }
    },
    dispose: (id) => {
      themeSubscribers.delete(id)
      globalThis.__arguiThemeDispose(id)
    },
  },
  control: (request) => {
    const error = globalThis.__arguiControl(JSON.stringify(request))
    if (error) throw new Error(error)
  },
  subscribeProfile: (callback) => {
    profileSubscriber = callback
    return () => { if (profileSubscriber === callback) profileSubscriber = null }
  },
  i18n: {
    load: (config) => i18nResponse(globalThis.__arguiI18nLoad(JSON.stringify(config))),
    select: (locale) => i18nResponse(globalThis.__arguiI18nSelect(locale)),
    tr: (id, args = {}) => i18nResponse(globalThis.__arguiI18nTr(id, JSON.stringify(args))).value,
  },
}
