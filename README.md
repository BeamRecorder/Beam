# DemoRecorder

Application Electron/Vue et moteur de capture natif Rust multipiste.

## Développement

```bash
npm install
cargo build -p capture --bin capture-engine
npm run dev
# dans un autre terminal
npm run electron:dev
```

`DEMO_RECORDER_CAPTURE_ENGINE` permet de sélectionner explicitement un binaire moteur. Sans cette variable, Electron cherche successivement le binaire packagé, puis `target/release/capture-engine` et `target/debug/capture-engine` (avec l'extension `.exe` sous Windows).

## API renderer

Le preload isolé expose uniquement `window.capture`. Le renderer n'a accès ni à Node.js ni à une primitive IPC générique.

```ts
import { capture, type CaptureConfig } from '~/capture-api'

const catalog = await capture.discover()

const config: CaptureConfig = {
  projectId: '0190f3e5-9b7a-7e11-8000-000000000001',
  screen: { mode: 'source', sourceId: 'screen-id-from-catalog' },
  systemAudio: { mode: 'default-mix' },
  microphone: null,
  camera: null,
  cursor: { mode: 'separate', captureClicks: true, captureShape: true },
  recording: {
    outputRoot: 'recordings',
    videoBitrateBps: 12_000_000,
    targetFps: 60,
    keyframeIntervalSeconds: 2,
    queueCapacity: 8,
    minimumFreeBytes: 536_870_912,
  },
  failurePolicy: 'continue-without-optional-tracks',
}

// Raccourci recommandé : prepare + start dans le processus principal.
const session = await capture.start(config)
await capture.pause()
await capture.resume()
const completed = await capture.stop()
console.log(completed.manifestPath)
```

Pour un contrôle en deux temps, appeler `capture.prepare(config)`, puis `capture.start()`. Les autres méthodes sont `capabilities`, `permissions`, `formats`, et `status`. Une erreur du moteur rejette la promesse avec un `message` lisible et un `code` lorsque le protocole en fournit un.

## Vérifications

```bash
npm run build
cargo fmt --all --check
cargo test -p capture --all-features
cargo clippy -p capture --all-targets --all-features -- -D warnings
```

Les captures natives doivent en plus être validées sur une machine Windows et une machine macOS réelles ; une exécution WSL ou une compilation croisée ne valide pas les périphériques, les permissions ni les timings matériels.
