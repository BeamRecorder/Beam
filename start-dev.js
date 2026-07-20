const { spawn } = require('child_process')

console.log('Démarrage du serveur de développement Vite...')
const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true })

// Attendre 2 secondes que Vite démarre avant de lancer Electron
setTimeout(() => {
  console.log('Démarrage d\'Electron...')
  const electron = spawn('npx', ['electron', '.'], { stdio: 'inherit', shell: true })

  electron.on('close', (code) => {
    console.log('Fermeture d\'Electron, arrêt du serveur Vite...')
    vite.kill()
    process.exit(code)
  })
}, 2000)
