const { parentPort, workerData } = require('node:worker_threads');
const { createProjectCatalogIndex } = require('./project-catalog-index.cjs');
const index = createProjectCatalogIndex(workerData.root, { roots: workerData.roots });
let queue = Promise.resolve();
parentPort.on('message', ({ id, request }) => {
  queue = queue.then(async () => {
    try {
      parentPort.postMessage({ id, result: await index.page(request) });
    } catch (error) {
      parentPort.postMessage({ id, error: error.message });
    }
  });
});
parentPort.on('close', () => index.close());
