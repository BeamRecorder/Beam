const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // Charge le build local en production, ou le serveur de dev sur le port 6500
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'dist/index.html'))
  } else {
    win.loadURL('http://localhost:6500')
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
