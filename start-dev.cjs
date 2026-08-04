const { spawn } = require('child_process');
const path = require('path');

const startupAt = process.hrtime.bigint();
const logTiming = (step) => {
  const elapsedMs = Number(process.hrtime.bigint() - startupAt) / 1_000_000;
  console.log(`[dev:all +${elapsedMs.toFixed(0)} ms] ${step}`);
};

// Gérer proprement le Ctrl+C (SIGINT) dans le terminal
let electron = null;
let vite = null;
let electronStarted = false;
const openDevTools = process.argv.includes('--devtools');

process.on('SIGINT', () => {
  console.log('\nInterrupt received (Ctrl+C). Stopping child processes...');
  if (electron) electron.kill('SIGTERM');
  if (vite) vite.kill('SIGTERM');
  process.exit(0);
});

logTiming('Building capture-engine (cargo build)...');
const cargo = spawn('cargo', ['build', '-p', 'capture', '--bin', 'capture-engine'], { stdio: 'inherit' });

cargo.on('close', (cargoCode) => {
  if (cargoCode !== 0) {
    console.error('capture-engine build failed.');
    process.exit(cargoCode);
  }
  logTiming('capture-engine build finished.');

  // Résoudre les chemins vers les fichiers JS directement
  const vitePath = path.join('node_modules', 'vite', 'bin', 'vite.js');
  const electronPath = path.join('node_modules', 'electron', 'cli.js');

  logTiming('Starting the Vite development server...');
  vite = spawn('node', [vitePath], { stdio: ['inherit', 'pipe', 'pipe'] });

  const startElectron = () => {
    if (electronStarted) return;
    electronStarted = true;
    logTiming('Starting Electron...');
    const electronStartedAt = performance.now();
    electron = spawn('node', [electronPath, '.'], {
      stdio: 'inherit',
      env: { ...process.env, DEMO_RECORDER_DEVTOOLS: openDevTools ? '1' : '0' },
    });

    electron.once('spawn', () => {
      logTiming(`Electron process created in ${Math.round(performance.now() - electronStartedAt)} ms.`);
    });
    electron.on('close', (code) => {
      console.log('Electron closed; stopping the Vite server...');
      vite.kill('SIGTERM');
      process.exit(code);
    });
  };

  const forwardViteOutput = (stream) => {
    stream.on('data', (chunk) => {
      const output = chunk.toString();
      process[stream === vite.stdout ? 'stdout' : 'stderr'].write(output);
    });
  };
  forwardViteOutput(vite.stdout);
  forwardViteOutput(vite.stderr);
  setTimeout(startElectron, 2_000);
  vite.once('error', (error) => {
    console.error(`The Vite server could not start: ${error.message}`);
    process.exit(1);
  });
  vite.once('close', (code) => {
    if (electronStarted) return;
    console.error(`The Vite server stopped before Electron started (code=${code}).`);
    process.exit(code || 1);
  });
});
