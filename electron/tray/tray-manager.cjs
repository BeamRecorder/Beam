const { Tray, Menu, nativeImage, app, ipcMain } = require('electron');
const path = require('path');

function createTrayManager({ applicationRoot, getWindow, getController, onShowHud = null, onQuickSnip = null }) {
  let tray = null;
  let labels = {
    openHud: 'Open HUD',
    stopRecording: 'Stop recording',
    quit: 'Quit Beam',
    tooltip: 'Beam',
    quickSnip: 'Quick Snip',
    startQuickSnip: 'Start Quick Snip',
    stopQuickSnip: 'Stop Quick Snip',
  };
  let recording = false;
  let quickSnipState = 'idle';

  const showHud = () => {
    if (onShowHud) return onShowHud();
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
        label:
          quickSnipState === 'recording'
            ? labels.stopQuickSnip
            : quickSnipState === 'selecting'
              ? labels.startQuickSnip
              : labels.quickSnip,
        enabled: !recording,
        click: () => onQuickSnip?.(),
      },
      { type: 'separator' },
      {
        label: labels.openHud,
        click: () => showHud(),
      },
      ...(recording
        ? [
            {
              label: labels.stopRecording,
              click: () => {
                const win = getWindow();
                if (win && !win.isDestroyed()) win.webContents.send('tray:stop-recording');
              },
            },
          ]
        : []),
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
    if (typeof newLabels.stopRecording === 'string' && newLabels.stopRecording)
      labels.stopRecording = newLabels.stopRecording;
    if (typeof newLabels.quit === 'string' && newLabels.quit) labels.quit = newLabels.quit;
    if (typeof newLabels.tooltip === 'string' && newLabels.tooltip) labels.tooltip = newLabels.tooltip;
    if (typeof newLabels.quickSnip === 'string' && newLabels.quickSnip) labels.quickSnip = newLabels.quickSnip;
    if (typeof newLabels.startQuickSnip === 'string' && newLabels.startQuickSnip)
      labels.startQuickSnip = newLabels.startQuickSnip;
    if (typeof newLabels.stopQuickSnip === 'string' && newLabels.stopQuickSnip)
      labels.stopQuickSnip = newLabels.stopQuickSnip;
    if (typeof newLabels.recording === 'boolean') recording = newLabels.recording;

    if (tray && !tray.isDestroyed()) {
      tray.setToolTip(labels.tooltip);
      tray.setContextMenu(buildMenu());
    }
  };

  const init = () => {
    if (tray) return tray;

    const fs = require('fs');
    const iconNames =
      process.platform === 'darwin'
        ? ['BeamTrayTemplate.png', 'BeamIcon.png']
        : process.platform === 'win32'
          ? ['BeamTray.ico', 'BeamIcon.ico', 'BeamIcon.png']
          : ['BeamTray.png', 'BeamIcon.png', 'BeamIcon.ico'];
    const roots = [
      path.join(applicationRoot, 'dist/brand'),
      path.join(applicationRoot, 'public/brand'),
      path.join(__dirname, '../../dist/brand'),
      path.join(__dirname, '../../public/brand'),
      path.join(process.cwd(), 'dist/brand'),
      path.join(process.cwd(), 'public/brand'),
    ];
    const candidatePaths = roots.flatMap((root) => iconNames.map((iconName) => path.join(root, iconName)));

    let icon = null;
    let iconPath = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const loaded = nativeImage.createFromPath(p);
        if (!loaded.isEmpty()) {
          icon = loaded;
          iconPath = p;
          break;
        }
      }
    }

    if (!icon) {
      throw new Error(`Beam tray icon is missing or unreadable. Searched: ${candidatePaths.join(', ')}`);
    }
    if (process.platform === 'linux' && typeof icon.resize === 'function') {
      const resized = icon.resize({ width: 24, height: 24, quality: 'best' });
      if (!resized.isEmpty()) icon = resized;
    }

    tray = new Tray(icon);
    if (process.platform === 'linux') console.info(`[Beam tray] Linux StatusNotifierItem icon loaded from ${iconPath}`);
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
    setQuickSnipState(state) {
      quickSnipState = state;
      updateMenu();
    },
  };
}

module.exports = { createTrayManager };
