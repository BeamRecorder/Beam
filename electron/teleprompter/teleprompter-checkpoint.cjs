const { randomUUID } = require('crypto');
const { normalizeTeleprompterDocument } = require('./teleprompter-storage.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateTeleprompterViewState(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid teleprompter checkpoint');
  if (value.session !== null && (!UUID.test(value.session?.projectId) || !UUID.test(value.session?.sessionId)))
    throw new Error('Invalid teleprompter checkpoint session');
  if (
    !Number.isSafeInteger(value.activeLine) ||
    value.activeLine < 0 ||
    value.activeLine > 1_000_000 ||
    !Number.isFinite(value.scrollTop) ||
    value.scrollTop < 0 ||
    value.scrollTop > 1_000_000_000 ||
    typeof value.isEditing !== 'boolean' ||
    typeof value.isPaused !== 'boolean' ||
    typeof value.error !== 'string' ||
    value.error.length > 10_000
  )
    throw new Error('Invalid teleprompter checkpoint state');
  return {
    document: normalizeTeleprompterDocument(value.document),
    session: value.session === null ? null : { projectId: value.session.projectId, sessionId: value.session.sessionId },
    activeLine: value.activeLine,
    scrollTop: value.scrollTop,
    isEditing: value.isEditing,
    isPaused: value.isPaused,
    error: value.error,
  };
}

function createTeleprompterCheckpoint() {
  let pending = null;
  const cancel = () => {
    if (!pending) return;
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    current.resolve(null);
  };
  const request = (target) => {
    if (pending) return pending.promise;
    const id = randomUUID();
    let resolve, reject;
    const promise = new Promise((accept, fail) => {
      resolve = accept;
      reject = fail;
    });
    const timer = setTimeout(() => {
      pending = null;
      reject(new Error('The teleprompter did not checkpoint; its renderer was retained to preserve the draft.'));
    }, 2_000);
    timer.unref?.();
    pending = { id, sender: target.webContents, resolve, reject, timer, promise };
    try {
      target.webContents.send('teleprompter:suspend', id);
    } catch (error) {
      pending = null;
      clearTimeout(timer);
      reject(error);
    }
    return promise;
  };
  const acknowledge = (sender, id, value) => {
    if (!pending || pending.sender !== sender || pending.id !== id) return false;
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    try {
      current.resolve(validateTeleprompterViewState(value));
    } catch (error) {
      current.reject(error);
    }
    return true;
  };
  return { request, acknowledge, cancel };
}
module.exports = { createTeleprompterCheckpoint, validateTeleprompterViewState };
