const PREVIEW_STATES = new Set(['idle', 'completed', 'failed']);

// One native preview serves several renderer windows. A renderer owns only its
// subscription; the Rust engine still owns the monitor and capture lifecycle.
function createSystemAudioPreview({ request, canCleanup = () => true, canStart = () => true }) {
  const clients = new Map();
  let active = false;
  let generation = 0;
  let pending = Promise.resolve();
  const enqueue = (operation) => {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  };
  const invalidate = () => {
    generation += 1;
    active = false;
  };
  const ensureStarted = async () => {
    const status = await request('status');
    if (!PREVIEW_STATES.has(status.state)) {
      invalidate();
      return false;
    }
    if (!active) {
      const expectedGeneration = generation;
      await request('start-system-audio-preview');
      // Prepare can stop the monitor while its start response is in flight.
      active = expectedGeneration === generation;
    }
    return active;
  };
  const removeClient = (sender) => {
    const destroyed = clients.get(sender);
    if (!destroyed) return false;
    clients.delete(sender);
    sender.removeListener('destroyed', destroyed);
    return true;
  };
  const stop = (sender) =>
    enqueue(async () => {
      if (!removeClient(sender) || clients.size > 0) return;
      invalidate();
      if (!canCleanup()) return;
      try {
        await request('stop-system-audio-preview');
      } catch (error) {
        // Shutdown owns native teardown; a stop already in flight can be rejected.
        if (canCleanup()) throw error;
      }
    });
  const start = (sender) =>
    enqueue(async () => {
      if (sender.isDestroyed() || !canStart()) return;
      if (!clients.has(sender)) {
        const destroyed = () => {
          void stop(sender).catch((error) => console.warn('[Audio preview] Cleanup failed:', error.message));
        };
        clients.set(sender, destroyed);
        sender.once('destroyed', destroyed);
      }
      try {
        await ensureStarted();
      } catch (error) {
        removeClient(sender);
        invalidate();
        throw error;
      }
    });
  const level = (sender) =>
    enqueue(async () => {
      if (!canStart() || !clients.has(sender) || !(await ensureStarted())) return { level: 0 };
      return request('system-audio-preview-level');
    });
  return { start, stop, level, invalidate };
}

module.exports = { createSystemAudioPreview };
