const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const color = (value, fallback) =>
  typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : fallback;

function normalizeEffectSettings(clip) {
  const effectColor = color(clip.color, null);
  if (
    !['rectangle', 'square', 'circle'].includes(clip.shape) ||
    !['blur', 'frosted', 'pixelated', 'opaque', 'highlight'].includes(clip.mode) ||
    !finite(clip.strength) ||
    clip.strength < 0 ||
    clip.strength > 100 ||
    (clip.feather !== undefined && (!finite(clip.feather) || clip.feather < 0 || clip.feather > 100)) ||
    (clip.cornerRadius !== undefined &&
      (!finite(clip.cornerRadius) || clip.cornerRadius < 0 || clip.cornerRadius > 100)) ||
    (clip.tintOpacity !== undefined && (!finite(clip.tintOpacity) || clip.tintOpacity < 0 || clip.tintOpacity > 100)) ||
    effectColor === null ||
    (clip.highlightColor !== undefined && color(clip.highlightColor, null) === null)
  )
    throw new Error('Effet de flou invalide');
  return {
    shape: clip.shape,
    mode: clip.mode,
    strength: Math.max(0, Math.min(100, clip.strength)),
    feather: clip.feather === undefined ? 0 : Math.max(0, Math.min(100, clip.feather)),
    cornerRadius: clip.cornerRadius === undefined ? 0 : Math.max(0, Math.min(100, clip.cornerRadius)),
    tintOpacity: clip.tintOpacity === undefined ? 0 : Math.max(0, Math.min(100, clip.tintOpacity)),
    color: effectColor,
    ...(clip.highlightColor !== undefined ? { highlightColor: clip.highlightColor } : {}),
  };
}
module.exports = { normalizeEffectSettings };
