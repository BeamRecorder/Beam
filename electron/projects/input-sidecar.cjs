const modifiers = new Set(['control', 'shift', 'alt', 'meta']);
const keys = new Set([
  ...'abcdefghijklmnopqrstuvwxyz',
  ...Array.from({ length: 10 }, (_, index) => `digit${index}`),
  'arrow-up',
  'arrow-down',
  'arrow-left',
  'arrow-right',
  'escape',
  'enter',
  'tab',
  'backspace',
  'delete',
  'insert',
  'home',
  'end',
  'page-up',
  'page-down',
  'space',
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
]);

const sessionTimestamp = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Timestamp input invalide');
  return value;
};

const normalizeEvent = (event) => {
  if (!event || typeof event !== 'object' || typeof event.pressed !== 'boolean')
    throw new Error('Événement input invalide');
  const sessionNs = sessionTimestamp(event.sessionNs);
  if (event.event === 'mouse-button') {
    if (!Number.isInteger(event.button) || event.button < 0 || event.button > 31)
      throw new Error('Bouton input invalide');
    return { event: 'mouse-button', sessionNs, button: event.button, pressed: event.pressed };
  }
  if (
    event.event !== 'shortcut' ||
    !Array.isArray(event.modifiers) ||
    event.modifiers.some((modifier) => !modifiers.has(modifier)) ||
    new Set(event.modifiers).size !== event.modifiers.length ||
    !keys.has(event.key)
  )
    throw new Error('Raccourci input invalide');
  return {
    event: 'shortcut',
    sessionNs,
    pressed: event.pressed,
    modifiers: [...event.modifiers],
    key: event.key,
  };
};

const normalizeInputSidecar = (value) => {
  if (!value || value.version !== 1 || !Array.isArray(value.events)) throw new Error('Sidecar input invalide');
  return { version: 1, events: value.events.map(normalizeEvent) };
};

const recordedPlatform = (value) => {
  if (value === 'windows' || value === 'macos' || value === 'linux') return value;
  return null;
};

module.exports = { normalizeInputSidecar, recordedPlatform };
