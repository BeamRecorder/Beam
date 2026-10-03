const validId = (id) =>
  typeof id === 'string' &&
  id.length <= 512 &&
  (/^color:(?:custom:)?#[0-9a-f]{6}$/i.test(id) ||
    /^gradient:[a-z0-9:_-]+$/i.test(id) ||
    /^user-wallpaper:(?:image|video):[^/\\\x00-\x1f]+$/.test(id));

function backgroundCatalogPatch(preferences, request) {
  if (!request || !['remove', 'restore', 'undo', 'redo'].includes(request.operation))
    throw new TypeError('Invalid background catalogue operation.');
  const extras = preferences.extras ?? {};
  const hidden = new Set(Array.isArray(extras.hiddenBackgroundIds) ? extras.hiddenBackgroundIds.filter(validId) : []);
  const previous = extras.backgroundCatalogHistory;
  let history =
    previous?.version === 1 && validId(previous.id) && typeof previous.deleted === 'boolean'
      ? { version: 1, id: previous.id, deleted: previous.deleted }
      : null;
  if (request.operation === 'remove' || request.operation === 'restore') {
    if (!validId(request.id)) throw new TypeError('Invalid background catalogue identity.');
    if (request.operation === 'remove') {
      if (!hidden.has(request.id)) history = { version: 1, id: request.id, deleted: true };
      hidden.add(request.id);
    } else {
      hidden.delete(request.id);
      if (history?.id === request.id) history.deleted = false;
    }
  } else {
    // Match the receipt displayed by the requesting window: another window may
    // have deleted a different item since that receipt was rendered.
    if (!history || request.id !== history.id) throw new Error('Background deletion history has changed.');
    history.deleted = request.operation === 'redo';
    if (history.deleted) hidden.add(history.id);
    else hidden.delete(history.id);
  }
  if (hidden.size > 4096) throw new RangeError('Background catalogue deletion limit reached.');
  // Only catalogue metadata changes. Project backgrounds and their source files
  // remain readable, including after restarting the application.
  return { extras: { ...extras, hiddenBackgroundIds: [...hidden], backgroundCatalogHistory: history } };
}

module.exports = { backgroundCatalogPatch };
