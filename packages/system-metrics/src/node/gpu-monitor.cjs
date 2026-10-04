const sources = new Set(['linux-drm', 'windows-pdh', 'macos-iokit']);
const scopes = new Set(['process', 'device']);
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 256;
function isGpuUsageSample(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return false;
  if (value.status === 'unavailable') return text(value.code) && text(value.reason);
  if (!sources.has(value.source) || !scopes.has(value.scope)) return false;
  if (value.status === 'warming') return true;
  return (
    value.status === 'sampled' &&
    Array.isArray(value.devices) &&
    value.devices.length > 0 &&
    value.devices.length <= 16 &&
    value.devices.every(
      (device) =>
        device &&
        text(device.id) &&
        text(device.name) &&
        Array.isArray(device.engines) &&
        device.engines.length > 0 &&
        device.engines.length <= 64 &&
        device.engines.every(
          (engine) =>
            engine &&
            text(engine.name) &&
            Number.isFinite(engine.busyPercent) &&
            engine.busyPercent >= 0 &&
            engine.busyPercent <= 100,
        ),
    )
  );
}
function accumulator() {
  const histogram = new Uint32Array(1001);
  let count = 0,
    sum = 0,
    min = 100,
    max = 0;
  return {
    add(value) {
      histogram[Math.round(value * 10)] += 1;
      count += 1;
      sum += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    },
    snapshot() {
      if (!count) return null;
      const lower = Math.floor((count - 1) / 2),
        upper = Math.floor(count / 2);
      let seen = 0,
        low,
        high;
      for (let index = 0; index < histogram.length; index++) {
        seen += histogram[index];
        if (low === undefined && seen > lower) low = index / 10;
        if (seen > upper) {
          high = index / 10;
          break;
        }
      }
      return {
        count,
        min,
        median: Math.min(max, Math.max(min, (low + high) / 2)),
        mean: Math.min(max, Math.max(min, sum / count)),
        max,
      };
    },
  };
}

/** One asynchronous native read at a time. Storage is bounded independently of export duration. */
function createGpuMonitor({ processIds, sample, dispose, intervalMs = 1000, clock = () => performance.now() }) {
  if (!Number.isFinite(intervalMs) || intervalMs < 250 || intervalMs > 10000)
    throw new RangeError('GPU sampling interval must be between 250 and 10000 ms.');
  const started = clock(),
    engines = new Map(),
    issues = new Map(),
    busiest = accumulator();
  let source = null,
    scope = null,
    samples = 0,
    missedSamples = 0;
  let running = true,
    timer,
    finishing,
    ended;
  const issue = (code, reason) => {
    if (issues.size < 8 || issues.has(code))
      issues.set(code, {
        code,
        reason: String(reason).slice(0, 256) || 'GPU counter operation returned an empty diagnostic',
      });
  };
  const poll = async () => {
    try {
      const pids = await processIds();
      if (!Array.isArray(pids) || pids.length > 16 || pids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0))
        throw new TypeError('Invalid GPU process identifiers.');
      const value = await sample([...new Set(pids)]);
      if (!isGpuUsageSample(value)) throw new TypeError('Invalid native GPU counter response.');
      if (value.status === 'unavailable') {
        missedSamples += 1;
        issue(value.code, value.reason);
        return;
      }
      if (source && (value.source !== source || value.scope !== scope))
        throw new Error('GPU counter source or scope changed during measurement.');
      source = value.source;
      scope = value.scope;
      if (value.status === 'warming') return;
      const seen = new Set();
      let maximum = 0;
      for (const device of value.devices)
        for (const engine of device.engines) {
          const key = JSON.stringify([device.id, engine.name]);
          if (seen.has(key)) throw new Error('Duplicate native GPU engine counters.');
          seen.add(key);
        }
      if (new Set([...engines.keys(), ...seen]).size > 128) throw new Error('GPU engine counter limit exceeded.');
      for (const device of value.devices)
        for (const engine of device.engines) {
          const key = JSON.stringify([device.id, engine.name]);
          if (!engines.has(key))
            engines.set(key, {
              deviceId: device.id,
              deviceName: device.name,
              engine: engine.name,
              values: accumulator(),
            });
          engines.get(key).values.add(engine.busyPercent);
          maximum = Math.max(maximum, engine.busyPercent);
        }
      busiest.add(maximum);
      samples += 1;
    } catch (error) {
      missedSamples += 1;
      issue('sampling-error', error instanceof Error ? error.message : String(error));
    }
  };
  const snapshot = () => ({
    version: 1,
    status: samples ? 'available' : 'unavailable',
    source,
    scope,
    intervalMs,
    durationMs: Math.max(0, (ended ?? clock()) - started),
    samples,
    missedSamples,
    busiestEngine: busiest.snapshot(),
    engines: [...engines.values()].map(({ values, ...engine }) => ({ ...engine, statistics: values.snapshot() })),
    medianResolution: 0.1,
    issues:
      samples || issues.size
        ? [...issues.values()]
        : [{ code: 'no-samples', reason: 'No completed GPU measurement interval' }],
  });
  const tick = async () => {
    await poll();
    if (running)
      timer = setTimeout(() => {
        pending = tick();
      }, intervalMs);
  };
  let pending = tick();
  return {
    snapshot,
    finish() {
      if (finishing) return finishing;
      running = false;
      clearTimeout(timer);
      finishing = (async () => {
        await pending;
        await poll();
        ended = clock();
        try {
          await dispose();
        } catch (error) {
          issue('disposal-error', error instanceof Error ? error.message : String(error));
        }
        return snapshot();
      })();
      return finishing;
    },
  };
}
module.exports = { createGpuMonitor, isGpuUsageSample };
