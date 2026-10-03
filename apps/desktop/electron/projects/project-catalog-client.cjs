const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { validatePageRequest } = require('./project-catalog-page.cjs');

function createProjectCatalogClient(
  root,
  { idleMs = 10_000, createWorker = (file, options) => new Worker(file, options) } = {},
) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new TypeError('Invalid catalogue root.');
  let worker = null,
    timer = null,
    sequence = 0,
    destroyed = false;
  const pending = new Map();
  const release = () => {
    clearTimeout(timer);
    timer = null;
    const previous = worker;
    worker = null;
    return previous?.terminate();
  };
  const idle = () => {
    clearTimeout(timer);
    if (pending.size || destroyed) return;
    timer = setTimeout(release, idleMs);
    timer.unref?.();
  };
  const rejectPending = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    return release();
  };
  const ensureWorker = () => {
    if (worker) return worker;
    const created = createWorker(path.join(__dirname, 'project-catalog-worker.cjs'), { workerData: { root } });
    worker = created;
    created.on('message', (message) => {
      if (worker !== created) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.result);
      idle();
    });
    created.on('error', (error) => {
      if (worker === created) rejectPending(error);
    });
    created.on('exit', () => {
      if (worker === created) rejectPending(new Error('The project catalogue worker stopped.'));
    });
    return created;
  };
  return {
    page(payload) {
      if (destroyed) return Promise.reject(new Error('The project catalogue is closed.'));
      let request;
      try {
        request = validatePageRequest(payload);
      } catch (error) {
        return Promise.reject(error);
      }
      clearTimeout(timer);
      let created;
      try {
        created = ensureWorker();
      } catch (error) {
        return Promise.reject(error);
      }
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        try {
          created.postMessage({ id, request });
        } catch (error) {
          rejectPending(error);
        }
      });
    },
    destroy() {
      destroyed = true;
      return rejectPending(new Error('The project catalogue is closed.'));
    },
  };
}
module.exports = { createProjectCatalogClient };
