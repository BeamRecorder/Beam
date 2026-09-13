const KINDS = new Set(['microphone', 'camera', 'systemAudio']);

function validateDeviceMenu(request) {
  if (
    !request ||
    !KINDS.has(request.kind) ||
    !Array.isArray(request.options) ||
    request.options.length === 0 ||
    request.options.length > 100 ||
    typeof request.selectedId !== 'string' ||
    request.selectedId.length > 1024
  )
    throw new Error('Invalid Quick Snip device menu.');
  if (
    request.position !== undefined &&
    (!request.position ||
      ![request.position.x, request.position.y].every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 10000,
      ))
  )
    throw new Error('Invalid Quick Snip device menu position.');
  const ids = new Set();
  for (const option of request.options) {
    if (
      !option ||
      typeof option.id !== 'string' ||
      !option.id ||
      option.id.length > 1024 ||
      typeof option.label !== 'string' ||
      !option.label.trim() ||
      option.label.length > 256 ||
      ids.has(option.id)
    )
      throw new Error('Invalid Quick Snip device option.');
    if (request.kind === 'systemAudio' && !['on', 'off'].includes(option.id))
      throw new Error('Unsupported system audio source.');
    ids.add(option.id);
  }
}

function registerQuickSnipDeviceMenu({ applicationIpc, BrowserWindow, cropWindow, controller, Menu }) {
  let closeActive = null;
  const close = () => closeActive?.();
  applicationIpc.handle('quick-snip:choose-device', async (event, request) => {
    if (!cropWindow.owns(event.sender)) throw new Error('Quick Snip device menu sender is not authorized.');
    const state = controller.state();
    if (state.state !== 'selecting' || !state.job || state.job.mode === 'screenshot') return null;
    validateDeviceMenu(request);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return null;
    close();
    const nativeMenu = Menu ?? require('electron').Menu;
    return new Promise((resolve, reject) => {
      const sender = event.sender;
      let finished = false;
      const finish = (value = null, error = null) => {
        if (finished) return;
        finished = true;
        sender.removeListener('destroyed', dismiss);
        if (closeActive === dismiss) closeActive = null;
        if (error) {
          reject(error);
          return;
        }
        const current = controller.state();
        resolve(
          current.state === 'selecting' && current.job?.name === state.job.name && current.job?.mode === state.job.mode
            ? value
            : null,
        );
      };
      const menu = nativeMenu.buildFromTemplate(
        request.options.map((option) => ({
          label: option.label,
          type: 'radio',
          checked: option.id === request.selectedId,
          click: () => finish(option.id),
        })),
      );
      const dismiss = () => {
        try {
          menu.closePopup();
          finish();
        } catch (error) {
          finish(null, error);
        }
      };
      closeActive = dismiss;
      sender.once('destroyed', dismiss);
      try {
        menu.popup({
          window,
          ...(request.position && { x: request.position.x, y: request.position.y, sourceType: 'keyboard' }),
          callback: () => finish(),
        });
      } catch (error) {
        finish(null, error);
      }
    });
  });
  return { close };
}
module.exports = { registerQuickSnipDeviceMenu, validateDeviceMenu };
