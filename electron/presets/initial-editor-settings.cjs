const fs = require('fs');
const path = require('path');
const { historicalAppearance } = require('../projects/composition-appearance.cjs');

function initialEditorSettings(applicationRoot, isPackaged, random = Math.random) {
  const directory = path.join(applicationRoot, isPackaged ? 'dist' : 'public', 'wallpapers', 'image');
  const images = (fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : [])
    .filter((entry) => entry.isFile() && /\.(webp|png|jpe?g)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!images.length) throw new Error('Beam has no bundled screenshot backgrounds.');
  const background = `/wallpapers/image/${images[Math.min(images.length - 1, Math.floor(random() * images.length))]}`;
  const effect = (color) => ({
    springEnabled: true,
    springIntensity: 50,
    rippleEnabled: false,
    rippleStyle: 'none',
    rippleSize: 30,
    rippleColor: color,
  });
  const visual = {
    transform: { x: 0.06, y: 0.06, width: 0.88, height: 0.88 },
    appearance: { ...historicalAppearance('screen', true), shadowSize: 'lg', shadowDirection: 'all' },
    isMirrored: false,
    isMirroredY: false,
    playbackRate: 1,
    transitions: { entry: null, exit: null },
    cameraLayoutPreset: 'custom',
    cameraFramingPreset: 'custom',
  };
  return {
    schemaVersion: 1,
    presentation: {
      canvas: { preset: '16:9', width: 1920, height: 1080, showBackground: true },
      selectedBackgroundId: background,
      background: null,
      blurPercent: 30,
      cursor: {
        selection: { packId: 'builtin:macos', mode: 'automatic', cursorId: null },
        size: 32,
        color: '#ffffff',
        shadow: { enabled: true, blur: 20, color: '#000000', direction: 'all' },
        clickEffects: { left: effect('#ff5a1f'), right: effect('#6366f1') },
        motion: { preset: 'smooth', smoothing: 0.67, springMassMultiplier: 1.29, motionBlur: 0.4 },
        autoHide: { enabled: false, delaySeconds: 2, fadeDurationMs: 250 },
      },
    },
    visual: { screen: visual, image: visual },
  };
}

module.exports = { initialEditorSettings };
