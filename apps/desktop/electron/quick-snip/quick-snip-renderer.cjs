const { randomUUID } = require('crypto');

function createQuickSnipRenderer({ applicationIpc, statusWindow }) {
  let active = null;
  statusWindow.onRenderFailure?.((error) => active?.reject(error));
  const requireTask = (event, id) => {
    if (!statusWindow.owns(event.sender) || !active || active.task.id !== id)
      throw new Error('Quick Snip render is not authorized.');
    return active;
  };
  applicationIpc.handle('quick-snip:render-task', (event) =>
    statusWindow.owns(event.sender) ? (active?.task ?? null) : null,
  );
  applicationIpc.handle('quick-snip:render-state', (event, { id, state } = {}) => {
    const job = requireTask(event, id);
    job.store.saveEditorState(job.task.configuration.projectId, state);
  });
  applicationIpc.handle('quick-snip:render-report', (event, report = {}) => {
    const job = requireTask(event, report.id);
    if (report.type === 'progress') {
      if (
        typeof report.progress !== 'number' ||
        !Number.isFinite(report.progress) ||
        report.progress < 0 ||
        report.progress > 1
      )
        throw new Error('Invalid render progress.');
      const preview =
        typeof report.preview === 'string' &&
        report.preview.length < 200_000 &&
        /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(report.preview)
          ? report.preview
          : undefined;
      job.onProgress(report.progress, { preview });
    } else if (report.type === 'completed') {
      if (report.path !== job.target) throw new Error('Unexpected Quick Snip export destination.');
      job.resolve({
        path: job.target,
        projectId: job.task.configuration.projectId,
      });
    } else if (report.type === 'failed') job.reject(new Error(String(report.error || 'Quick Snip rendering failed.')));
    else throw new Error('Invalid render report.');
  });
  return {
    destination(sender, format) {
      if (!statusWindow.owns(sender)) return null;
      if (!active || active.task.configuration.format !== format) throw new Error('No Quick Snip render is active.');
      return active.target;
    },
    async render({ configuration, store, target, signal, onProgress }) {
      if (active) throw new Error('A Quick Snip render is already active.');
      if (signal?.aborted) throw Object.assign(new Error('Canceled'), { name: 'AbortError' });
      const task = {
        id: randomUUID(),
        configuration,
        editorData: store.editorData(configuration.projectId),
        editorState: store.editorState(configuration.projectId),
      };
      let abort;
      try {
        return await new Promise((resolve, reject) => {
          active = { task, target, store, onProgress, resolve, reject };
          abort = () => reject(Object.assign(new Error('Canceled'), { name: 'AbortError' }));
          signal?.addEventListener('abort', abort, { once: true });
          statusWindow.setRenderTask(task);
        });
      } finally {
        signal?.removeEventListener('abort', abort);
        active = null;
        statusWindow.setRenderTask(null);
      }
    },
  };
}
module.exports = { createQuickSnipRenderer };
