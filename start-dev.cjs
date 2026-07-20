const { spawn } = require('child_process')
const path = require('path')

// Gérer proprement le Ctrl+C (SIGINT) dans le terminal
let electron = null
let vite = null

process.on('SIGINT', () => {
  console.log('\nInterruption détectée (Ctrl+C). Arrêt des processus enfants...')
  if (electron) electron.kill('SIGTERM')
  if (vite) vite.kill('SIGTERM')
  process.exit(0)
})

console.log('Compilation de capture-engine (cargo build)...')
const cargo = spawn('cargo', ['build', '-p', 'capture', '--bin', 'capture-engine'], { stdio: 'inherit' })

cargo.on('close', (cargoCode) => {
  if (cargoCode !== 0) {
    console.error('La compilation du capture-engine a échoué.')
    process.exit(cargoCode)
  }

  // Résoudre les chemins vers les fichiers JS directement
  const vitePath = path.join('node_modules', 'vite', 'bin', 'vite.js')
  const electronPath = path.join('node_modules', 'electron', 'cli.js')

  console.log('Démarrage du serveur de développement Vite...')
  vite = spawn('node', [vitePath], { stdio: 'inherit' })

  setTimeout(() => {
    console.log('Démarrage d\'Electron...')
    electron = spawn('node', [electronPath, '.'], { stdio: 'inherit' })

    electron.on('close', (code) => {
      console.log('Fermeture d\'Electron, arrêt du serveur Vite...')
      vite.kill('SIGTERM')
      process.exit(code)
    })
  }, 2000)
})
