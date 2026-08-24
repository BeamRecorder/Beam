const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 600;
const color = (value) => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null);

const normalizeColorFill = (value) => {
  if (!value || typeof value !== 'object') throw new Error('Remplissage de couleur invalide');
  if (value.kind === 'color') {
    const fillColor = color(value.color);
    if (!fillColor) throw new Error('Couleur de calque invalide');
    return { kind: 'color', color: fillColor };
  }
  if (value.kind !== 'gradient' || !value.gradient || typeof value.gradient !== 'object')
    throw new Error('Dégradé de calque invalide');
  const gradient = value.gradient;
  if (
    !['linear', 'radial'].includes(gradient.type) ||
    !finite(gradient.angle) ||
    gradient.angle < 0 ||
    gradient.angle >= 360 ||
    !Array.isArray(gradient.stops) ||
    gradient.stops.length < 2
  )
    throw new Error('Dégradé de calque invalide');
  return {
    kind: 'gradient',
    gradient: {
      type: gradient.type,
      angle: gradient.angle,
      stops: gradient.stops.map((stop) => {
        const stopColor = color(stop?.color);
        if (
          !id(stop?.id) ||
          !finite(stop?.position) ||
          stop.position < 0 ||
          stop.position > 1 ||
          !stopColor ||
          !finite(stop?.alpha) ||
          stop.alpha < 0 ||
          stop.alpha > 1
        )
          throw new Error('Étape de dégradé invalide');
        return { id: stop.id, position: stop.position, color: stopColor, alpha: stop.alpha };
      }),
    },
  };
};

module.exports = { normalizeColorFill };
