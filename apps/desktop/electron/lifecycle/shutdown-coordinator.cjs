const GRACEFUL_DEADLINE_MS = 2_000;
const CLEANUP_DEADLINE_MS = 2_000;
const TOTAL_SHUTDOWN_DEADLINE_MS = 5_000;

const SHUTDOWN_REASONS = Object.freeze([
  'hud',
  'tray',
  'before-quit',
  'window-all-closed',
  'updater',
  'signal',
  'renderer-crash',
  'fatal',
]);

function withDeadline(operation, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

function createShutdownCoordinator({
  captureEngine,
  log = () => {},
  gracefulDeadlineMs = GRACEFUL_DEADLINE_MS,
  cleanupDeadlineMs = CLEANUP_DEADLINE_MS,
  shutdownDeadlineMs = TOTAL_SHUTDOWN_DEADLINE_MS,
}) {
  let state = 'running'; // running | shutting-down | shutdown-complete
  let shutdownPromise = null;
  const cleanups = [];
  const errors = [];

  const registerCleanup = ({ id, cleanup, deadlineMs = cleanupDeadlineMs }) => {
    cleanups.push({ id, cleanup, deadlineMs });
    return () => {
      const index = cleanups.findIndex((entry) => entry.id === id);
      if (index >= 0) cleanups.splice(index, 1);
    };
  };

  const requestShutdown = (source) => {
    if (shutdownPromise) return shutdownPromise;
    if (state === 'shutdown-complete') return Promise.resolve({ source, errors });
    state = 'shutting-down';
    log(`shutdown requested (source=${source})`);
    shutdownPromise = performShutdown(source);
    return shutdownPromise;
  };

  const performShutdown = async (source) => {
    const message = (error) => (error instanceof Error ? error.message : String(error));
    let forcePromise = null;
    const forceNative = () => {
      forcePromise ??= Promise.resolve().then(() => captureEngine.forceShutdown());
      return forcePromise;
    };
    const nativeShutdown = async () => {
      try {
        await withDeadline(() => captureEngine.shutdown(), gracefulDeadlineMs, 'capture-engine graceful shutdown');
      } catch (error) {
        errors.push(message(error));
      }
      const forced = await forceNative();
      if (forced && forced.confirmed === false && forced.reason !== 'no capture-engine process') {
        errors.push(`capture-engine exit unconfirmed: ${forced.reason}`);
      }
    };
    const resourceShutdown = () =>
      Promise.allSettled(
        cleanups.map(({ id, cleanup, deadlineMs }) =>
          withDeadline(cleanup, deadlineMs, `cleanup ${id}`).catch((error) => {
            errors.push(`${id}: ${message(error)}`);
          }),
        ),
      );
    try {
      // Resource cleanup runs alongside native shutdown so the contractual
      // total deadline is not the sum of every independent deadline.
      await withDeadline(
        () => Promise.all([nativeShutdown(), resourceShutdown()]),
        shutdownDeadlineMs,
        'application shutdown',
      );
    } catch (error) {
      errors.push(message(error));
      // The global deadline is also the deadline for returning control to
      // Electron. Dispatch the hard kill once; the engine-level parent guard
      // remains the independent fallback if the child never reports exit.
      void forceNative().catch((forceError) => {
        errors.push(`capture-engine force shutdown: ${message(forceError)}`);
      });
    }
    state = 'shutdown-complete';
    log(`shutdown complete (source=${source})`);
    return { source, errors };
  };

  return {
    registerCleanup,
    requestShutdown,
    isShuttingDown: () => state === 'shutting-down',
    isComplete: () => state === 'shutdown-complete',
    canAcceptWork: () => state === 'running',
    getState: () => state,
  };
}

module.exports = {
  CLEANUP_DEADLINE_MS,
  GRACEFUL_DEADLINE_MS,
  SHUTDOWN_REASONS,
  TOTAL_SHUTDOWN_DEADLINE_MS,
  createShutdownCoordinator,
  withDeadline,
};
