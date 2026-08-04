const { Tray, Menu, nativeImage, app } = require('electron')
const path = require('path')

const enTray = require('../../src/i18n/en/Tray.json')
const frTray = require('../../src/i18n/fr/Tray.json')

const messages = {
  fr: frTray,
  en: enTray,
}

function createTrayManager({ applicationRoot, getWindow, getController }) {
  let tray = null

  const getLocale = () => {
    try {
      const loc = app.getLocale() || 'en'
      return loc.startsWith('fr') ? 'fr' : 'en'
    } catch {
      return 'en'
    }
  }

  const showHud = () => {
    const win = getWindow()
    const controller = getController()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    if (controller) {
      controller.setMode('hud')
    }
    win.show()
    win.focus()
  }

  const buildMenu = () => {
    const lang = getLocale()
    const t = messages[lang] || messages.en

    return Menu.buildFromTemplate([
      {
        label: t.openHud,
        click: () => showHud(),
      },
      { type: 'separator' },
      {
        label: t.quit,
        click: () => {
          app.quit()
        },
      },
    ])
  }

  const init = () => {
    if (tray) return tray

    const iconPath = path.join(applicationRoot, 'public/brand/BeamIcon.ico')
    let icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty()
    }

    tray = new Tray(icon)
    const lang = getLocale()
    const t = messages[lang] || messages.en
    tray.setToolTip(t.tooltip)

    tray.setContextMenu(buildMenu())

    tray.on('click', () => {
      showHud()
    })

    tray.on('double-click', () => {
      showHud()
    })

    return tray
  }

  const destroy = () => {
    if (tray && !tray.isDestroyed()) {
      tray.destroy()
      tray = null
    }
  }

  return {
    init,
    destroy,
    showHud,
  }
}

module.exports = { createTrayManager }
