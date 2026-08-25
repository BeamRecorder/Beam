const transitionKinds = new Set(['fade', 'slide', 'zoom', 'blur']);

const easingPower = (value) => {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error('Courbe de transition invalide');
  return value;
};

const transition = (value, clipKind) => {
  if (value === null) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    !Number.isInteger(value.durationMs) ||
    value.durationMs <= 0 ||
    value.durationMs > 5000
  )
    throw new Error('Transition de clip invalide');
  const preset = value.preset;
  if (!preset || !transitionKinds.has(preset.kind) || (clipKind === 'audio' && preset.kind !== 'fade'))
    throw new Error('Preset de transition invalide');
  if (preset.kind === 'slide' && !['left', 'right', 'up', 'down'].includes(preset.direction))
    throw new Error('Direction de transition invalide');
  if (preset.kind === 'zoom' && !['in', 'out'].includes(preset.direction))
    throw new Error('Direction de transition invalide');
  if ((preset.kind === 'fade' || preset.kind === 'blur') && Object.keys(preset).some((key) => key !== 'kind'))
    throw new Error('Paramètres de transition invalides');
  const power = easingPower(value.easingPower);
  return {
    preset: { ...preset },
    durationMs: value.durationMs,
    ...(power === undefined ? {} : { easingPower: power }),
  };
};

const normalizeClipTransitions = (value, clipKind, durationMs) => {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'entry') || !Object.hasOwn(value, 'exit'))
    throw new Error('Transitions de clip invalides');
  const next = { entry: transition(value.entry, clipKind), exit: transition(value.exit, clipKind) };
  if ((next.entry?.durationMs || 0) + (next.exit?.durationMs || 0) > durationMs)
    throw new Error('Durée de transitions invalide');
  return next;
};

module.exports = { normalizeClipTransitions };
