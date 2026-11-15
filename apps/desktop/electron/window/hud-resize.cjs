const { DEFAULT_HUD_WINDOW_SIZE } = require('./hud-window-size.cjs');
const EDGES = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

function resizedBounds(bounds, edge, dx, dy, area) {
  const width = Math.max(
    DEFAULT_HUD_WINDOW_SIZE.width,
    Math.min(bounds.width + (edge.includes('e') ? dx : edge.includes('w') ? -dx : 0), Math.min(1200, area.width)),
  );
  const height = Math.max(
    DEFAULT_HUD_WINDOW_SIZE.height,
    Math.min(bounds.height + (edge.includes('s') ? dy : edge.includes('n') ? -dy : 0), Math.min(720, area.height)),
  );
  return {
    x: Math.round(
      Math.max(
        area.x,
        Math.min(
          edge.includes('w') ? bounds.x + bounds.width - width : bounds.x,
          area.x + Math.max(0, area.width - width),
        ),
      ),
    ),
    y: Math.round(
      Math.max(
        area.y,
        Math.min(
          edge.includes('n') ? bounds.y + bounds.height - height : bounds.y,
          area.y + Math.max(0, area.height - height),
        ),
      ),
    ),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function registerHudResizeIpc(ipcMain, windowForEvent, controllerForWindow, screen) {
  const gestures = new WeakMap();
  ipcMain.handle('window:resize-hud', (event, edge, phase) => {
    const win = windowForEvent(event);
    const controller = controllerForWindow(win);
    if (!win || win.isDestroyed() || controller?.mode !== 'hud') return null;
    if (!['read', 'start', 'move', 'end'].includes(phase)) throw new Error('Invalid HUD resize phase.');
    if (phase === 'read') return controller.hudSize;
    if (phase === 'end') {
      gestures.delete(win);
      return controller.hudSize;
    }
    if (phase === 'start') {
      if (!EDGES.has(edge)) throw new Error('Invalid HUD resize edge.');
      const bounds = win.getBounds();
      gestures.set(win, {
        bounds: { ...bounds, ...controller.hudSize },
        edge,
        pointer: screen.getCursorScreenPoint(),
        area: screen.getDisplayMatching(bounds).workArea,
      });
      return controller.hudSize;
    }
    const gesture = gestures.get(win);
    if (!gesture) return null;
    const pointer = screen.getCursorScreenPoint();
    const next = resizedBounds(
      gesture.bounds,
      gesture.edge,
      pointer.x - gesture.pointer.x,
      pointer.y - gesture.pointer.y,
      gesture.area,
    );
    controller.userHudSize = { width: next.width, height: next.height };
    controller.hudSize = controller.userHudSize;
    win.setBounds(next);
    return controller.hudSize;
  });
}
module.exports = { resizedBounds, registerHudResizeIpc };
