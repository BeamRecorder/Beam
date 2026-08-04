const { Tray, Menu, nativeImage, app, ipcMain } = require('electron');
const path = require('path');

function createTrayManager({ applicationRoot, getWindow, getController }) {
  let tray = null;
  let labels = {
    openHud: 'Open HUD',
    quit: 'Quit Beam',
    tooltip: 'Beam',
  };

  const showHud = () => {
    const win = getWindow();
    const controller = getController();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    if (controller) {
      controller.setMode('hud');
    }
    win.show();
    win.focus();
  };

  const buildMenu = () => {
    return Menu.buildFromTemplate([
      {
        label: labels.openHud,
        click: () => showHud(),
      },
      { type: 'separator' },
      {
        label: labels.quit,
        click: () => {
          app.quit();
        },
      },
    ]);
  };

  const updateMenu = (newLabels = {}) => {
    if (typeof newLabels.openHud === 'string' && newLabels.openHud) labels.openHud = newLabels.openHud;
    if (typeof newLabels.quit === 'string' && newLabels.quit) labels.quit = newLabels.quit;
    if (typeof newLabels.tooltip === 'string' && newLabels.tooltip) labels.tooltip = newLabels.tooltip;

    if (tray && !tray.isDestroyed()) {
      tray.setToolTip(labels.tooltip);
      tray.setContextMenu(buildMenu());
    }
  };

  const init = () => {
    if (tray) return tray;

    const fs = require('fs');
    const candidatePaths = [
      path.join(applicationRoot, 'dist/brand/BeamIcon.ico'),
      path.join(applicationRoot, 'public/brand/BeamIcon.ico'),
      path.join(__dirname, '../../dist/brand/BeamIcon.ico'),
      path.join(__dirname, '../../public/brand/BeamIcon.ico'),
      path.join(process.cwd(), 'dist/brand/BeamIcon.ico'),
      path.join(process.cwd(), 'public/brand/BeamIcon.ico'),
    ];

    let icon = nativeImage.createEmpty();
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const loaded = nativeImage.createFromPath(p);
        if (!loaded.isEmpty()) {
          icon = loaded;
          break;
        }
      }
    }

    tray = new Tray(icon);
    tray.setToolTip(labels.tooltip);
    tray.setContextMenu(buildMenu());

    tray.on('click', () => {
      showHud();
    });

    tray.on('double-click', () => {
      showHud();
    });

    ipcMain.on('tray:update-menu', (_event, payload) => {
      if (payload && typeof payload === 'object') {
        updateMenu(payload);
      }
    });

    return tray;
  };

  const destroy = () => {
    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
  };

  return {
    init,
    destroy,
    showHud,
    updateMenu,
  };
}

module.exports = { createTrayManager };
