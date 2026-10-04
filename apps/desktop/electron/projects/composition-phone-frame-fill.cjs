const { normalizeColorFill } = require('./composition-color-fill.cjs');

const defaultPhoneFrameFill = () => ({ kind: 'color', color: '#000000' });

const normalizePhoneFrameFill = (value) => {
  if (value === undefined) return defaultPhoneFrameFill();
  if (value?.kind === 'adaptive') return { kind: 'adaptive' };
  if (value?.kind === 'continuity') {
    if (!Number.isFinite(value.blur) || !Number.isFinite(value.brightness))
      throw new Error('Fond de continuité invalide');
    return {
      kind: 'continuity',
      blur: Math.max(0, Math.min(48, value.blur)),
      brightness: Math.max(20, Math.min(100, value.brightness)),
    };
  }
  return normalizeColorFill(value);
};

module.exports = { normalizePhoneFrameFill };
