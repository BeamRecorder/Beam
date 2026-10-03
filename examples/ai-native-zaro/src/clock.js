export const DURATION = 68.6;
export function compositionTime(timeMs) {
  if (!Number.isFinite(timeMs)) throw new Error('Composition time must be finite.');
  return Math.max(0, Math.min(DURATION, timeMs / 1000));
}

/** Text is computed from the source clock, including reverse seeks and phrase replacements. */
export function textAt(time, start, duration, text) {
  const progress = Math.max(0, Math.min(1, (time - start) / duration));
  return text.slice(0, Math.floor(progress * text.length));
}

export const typing = [
  ['#one-prompt .typed', 2.367, 0.433, 'with one prompt.'],
  ['#meet .typed', 5, 0.3, 'Meet'],
  ['#build-title .typed', 8.7, 1.2, 'With a sentence.'],
  ['#app-prompt .typed', 10.667, 1.333, 'Build a tracker for my clients and deals'],
  ['#agent-chat .typed', 15.8, 1.1, 'Let’s add some'],
  ['#agents-title .typed', 19.8, 1.6, 'They keep it running.'],
  ['#simple .typed', 28.333, 0.6, 'Send me the digest on'],
  ['#connect .typed', 32.767, 1.233, 'Connect your mess.'],
  ['#connect .typed', 34.733, 0.5, 'Connect your files.'],
  ['#connect .typed', 35.5, 0.55, 'Connect your tools.'],
  ['#ask-title .typed', 43.9, 1.433, 'Your files answer.'],
  ['#question-prompt .typed', 46.433, 1.1, 'What did we actually agree to deliver for FluxCo?'],
  ['.grew-copy .typed', 62.85, 0.8, 'You grew a system.'],
];

export function createTextRenderer(root) {
  const targets = new Map();
  for (const [selector] of typing) {
    const element = root.querySelector(selector);
    if (!element) throw new Error('Missing typed reference element: ' + selector);
    targets.set(selector, element);
  }
  return (time) => {
    const values = new Map();
    for (const [selector, start, duration, text] of typing) {
      if (!values.has(selector) || time >= start) values.set(selector, textAt(time, start, duration, text));
    }
    for (const [selector, value] of values) {
      const element = targets.get(selector);
      if (element.textContent !== value) element.textContent = value;
    }
  };
}
