/** Host-independent HTML playback; also serialized into the opaque browser sandbox. */
function createHtmlPlaybackController(adapter) {
  let state = 'waiting',
    requested = 0,
    sequence = 0,
    running = false;
  const apply = async () => {
    if (state !== 'ready' || running) return;
    running = true;
    try {
      let applied;
      do {
        applied = sequence;
        const pending = adapter.seek(requested);
        if (pending) await pending;
      } while (state === 'ready' && applied !== sequence);
    } catch (error) {
      if (state !== 'disposed') {
        state = 'failed';
        adapter.failed(error);
      }
    } finally {
      running = false;
    }
  };
  return {
    get state() {
      return state;
    },
    seek(timeMs) {
      if (!Number.isFinite(timeMs) || timeMs < 0)
        throw new RangeError('HTML playback time must be finite and non-negative.');
      if (state === 'failed' || state === 'disposed') return;
      requested = timeMs;
      sequence++;
      void apply();
    },
    async start() {
      if (state !== 'waiting') return;
      state = 'ready';
      await apply();
    },
    dispose() {
      state = 'disposed';
    },
  };
}

module.exports = { createHtmlPlaybackController };
