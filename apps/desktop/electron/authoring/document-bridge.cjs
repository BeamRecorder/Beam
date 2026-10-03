const { randomUUID } = require('node:crypto');

function createDocumentBridge({ ipcMain, editorWindow }) {
  const documents = new Map(),
    pending = new Map();
  const observed = new WeakSet();
  const remove = (sender) => {
    documents.delete(sender.id);
    for (const [id, job] of pending)
      if (job.sender === sender) {
        clearTimeout(job.timer);
        pending.delete(id);
        job.reject(new Error('The editor document closed.'));
      }
  };
  const contextFor = (sender) => {
    const registered = documents.get(sender.id);
    const owned = editorWindow.contextFor(sender);
    if (!registered || !owned || owned.projectId !== registered.context.projectId)
      throw new Error('No active authoring document belongs to this editor.');
    return registered.context;
  };
  ipcMain.handle('authoring:register', (event, context) => {
    if (context === null) {
      remove(event.sender);
      return;
    }
    const owned = editorWindow.contextFor(event.sender);
    if (
      !owned ||
      context?.projectId !== owned.projectId ||
      context.kind !== (owned.kind === 'screenshot' ? 'image' : 'video')
    )
      throw new Error('The authoring document does not belong to this editor.');
    if (!observed.has(event.sender)) {
      observed.add(event.sender);
      event.sender.once('destroyed', () => remove(event.sender));
    }
    documents.set(event.sender.id, {
      sender: event.sender,
      context: { projectId: context.projectId, kind: context.kind, name: String(context.name).slice(0, 200) },
    });
  });
  ipcMain.on('authoring:reply', (event, id, response) => {
    const job = pending.get(id);
    if (!job || job.sender !== event.sender) return;
    pending.delete(id);
    clearTimeout(job.timer);
    job.resolve(response);
  });
  const find = (projectId) => {
    const matches = [...documents.values()].filter((item) => {
      try {
        return contextFor(item.sender).projectId === projectId;
      } catch {
        return false;
      }
    });
    if (matches.length !== 1)
      throw new Error(
        matches.length
          ? 'Multiple editors own this project.'
          : 'Open the project in Beam first and wait until the editor is ready.',
      );
    return matches[0];
  };
  return {
    contextFor,
    context(projectId) {
      return find(projectId).context;
    },
    list() {
      return [...documents.values()].flatMap(({ sender }) => {
        try {
          return [contextFor(sender)];
        } catch {
          return [];
        }
      });
    },
    request(projectId, request) {
      const { sender } = find(projectId);
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('The editor did not reply. Read its current revision before retrying a mutation.'));
        }, 30000);
        pending.set(id, { sender, timer, resolve, reject });
        sender.send('authoring:request', { id, request });
      });
    },
    dispose() {
      for (const { sender } of documents.values()) remove(sender);
    },
  };
}
module.exports = { createDocumentBridge };
