const fs = require('fs');
const path = require('path');

const hasMediaFiles = (directory, extensions) => {
  try {
    if (!directory || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return false;
    return fs
      .readdirSync(directory)
      .some((entry) => extensions.test(entry) && fs.statSync(path.join(directory, entry)).size > 0);
  } catch {
    return false;
  }
};

const hasCaptionContent = (clip) => {
  if (!clip || clip.kind !== 'caption') return false;
  if (clip.caption?.type === 'text' || Array.isArray(clip.caption?.sentences)) {
    const sentences = clip.caption?.sentences;
    return (
      Array.isArray(sentences) &&
      sentences.some(
        (sentence) =>
          (Array.isArray(sentence?.words) && sentence.words.length > 0) ||
          (typeof sentence?.text === 'string' && sentence.text.trim().length > 0),
      )
    );
  }
  if (clip.caption?.type === 'keyboard' || Array.isArray(clip.caption?.steps)) {
    return Array.isArray(clip.caption?.steps) && clip.caption.steps.length > 0;
  }
  return false;
};

function createProjectFeatureDetector({ safePath, sessionFileFor }) {
  const assetFileExists = (directory, asset) => {
    if (!asset) return false;
    try {
      const target =
        asset.origin === 'session'
          ? sessionFileFor(directory, asset.sessionId, asset.sessionPath)
          : path.join(directory, 'media', asset.fileName);
      return Boolean(target && fs.existsSync(target) && fs.statSync(target).size > 0);
    } catch {
      return false;
    }
  };

  const hasKeyboardCaptionEvents = (directory, sessionIds) => {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) return false;
    return sessionIds.some((sessionId) => {
      try {
        const file = sessionFileFor(directory, sessionId, path.join('cursor', 'input.json'));
        if (!file || !fs.existsSync(file)) return false;
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(data?.events) && data.events.length > 0;
      } catch {
        return false;
      }
    });
  };

  const recordedAudioKinds = (sessionDirectory) => {
    const manifestPath = ['manifest.json', 'manifest.partial.json']
      .map((name) => path.join(sessionDirectory, name))
      .find(fs.existsSync);
    if (!manifestPath) return new Set();
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const kinds = new Set();
      for (const track of Array.isArray(manifest.tracks) ? manifest.tracks : []) {
        if (!['system-audio', 'microphone'].includes(track?.kind) || track.status === 'failed') continue;
        const hasSegment = (Array.isArray(track.segments) ? track.segments : []).some((segment) => {
          const file = safePath(sessionDirectory, segment?.path);
          return segment?.complete !== false && file && fs.existsSync(file) && fs.statSync(file).size > 0;
        });
        if (hasSegment) kinds.add(track.kind);
      }
      return kinds;
    } catch {
      return new Set();
    }
  };

  return (directory, manifest, sessions) => {
    let hasScreen = false;
    let hasCamera = false;
    let hasCaption = false;
    let hasSystemAudio = false;
    let hasMicrophone = false;

    const assets = Array.isArray(manifest.editor?.composition?.assets) ? manifest.editor.composition.assets : [];
    const assetsMap = new Map(assets.map((asset) => [asset.id, asset]));
    const clips = Array.isArray(manifest.editor?.composition?.clips) ? manifest.editor.composition.clips : [];

    for (const clip of clips) {
      if (!clip) continue;
      const hasAsset = clip.assetId && assetFileExists(directory, assetsMap.get(clip.assetId));
      if ((clip.kind === 'screen' || clip.kind === 'video') && !hasScreen && hasAsset) {
        hasScreen = true;
      } else if (clip.kind === 'webcam' && !hasCamera && hasAsset) {
        hasCamera = true;
      } else if (clip.kind === 'caption' && !hasCaption && hasCaptionContent(clip)) {
        hasCaption = true;
      } else if (clip.kind === 'audio' && hasAsset) {
        if (clip.role === 'system') hasSystemAudio = true;
        if (clip.role === 'microphone') hasMicrophone = true;
      }
    }

    if (
      !hasCaption &&
      Array.isArray(manifest.editor?.composition?.keyboardCaptionSessions) &&
      manifest.editor.composition.keyboardCaptionSessions.length > 0
    ) {
      hasCaption = hasKeyboardCaptionEvents(directory, manifest.editor.composition.keyboardCaptionSessions);
    }

    for (const session of Array.isArray(sessions) ? sessions : []) {
      const sessionDirectory = safePath(directory, session?.relativePath);
      if (!sessionDirectory) continue;
      if (!hasScreen && hasMediaFiles(path.join(sessionDirectory, 'screen'), /\.(mp4|webm|mov|mkv)$/i)) {
        hasScreen = true;
      }
      if (!hasCamera && hasMediaFiles(path.join(sessionDirectory, 'camera'), /\.(mp4|webm|mov|mkv)$/i)) {
        hasCamera = true;
      }
      const audioKinds = recordedAudioKinds(sessionDirectory);
      if (audioKinds.has('system-audio')) hasSystemAudio = true;
      if (audioKinds.has('microphone')) hasMicrophone = true;
    }

    return { hasScreen, hasCamera, hasCaption, hasSystemAudio, hasMicrophone };
  };
}

module.exports = { createProjectFeatureDetector };
