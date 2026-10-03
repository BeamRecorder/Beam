/** Deterministic typewriter text. The host supplies milliseconds; no timer runs here. */
export function createTypingTrack(textElement, caretElement, options) {
  if (!textElement || !caretElement) throw new Error('Typing requires text and caret elements.');
  const { phrases, blinkMs = 550, hideCaretWhenDone = false } = options;
  if (!Array.isArray(phrases) || !phrases.length || !Number.isFinite(blinkMs) || blinkMs <= 0)
    throw new Error('Provide typing phrases and a positive caret blink interval.');
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  let previousStart = -1;
  const segments = phrases.map((phrase) => {
    if (
      typeof phrase.text !== 'string' ||
      !Number.isFinite(phrase.startMs) ||
      phrase.startMs < 0 ||
      !Number.isFinite(phrase.durationMs) ||
      phrase.durationMs < 0 ||
      phrase.startMs <= previousStart
    )
      throw new Error('Typing phrases need increasing nonnegative start times and durations.');
    previousStart = phrase.startMs;
    return { ...phrase, letters: [...segmenter.segment(phrase.text)].map((letter) => letter.segment) };
  });
  const isField = textElement.tagName === 'INPUT' || textElement.tagName === 'TEXTAREA';
  const seek = (timeMs) => {
    if (!Number.isFinite(timeMs)) throw new Error('Typing time must be finite.');
    const phrase = segments.findLast((item) => item.startMs <= timeMs);
    const progress = !phrase
      ? 0
      : phrase.durationMs === 0
        ? 1
        : Math.min(1, (timeMs - phrase.startMs) / phrase.durationMs);
    const text = phrase ? phrase.letters.slice(0, Math.floor(progress * phrase.letters.length)).join('') : '';
    if (isField) {
      if (textElement.value !== text) textElement.value = text;
    } else if (textElement.textContent !== text) textElement.textContent = text;
    const visible =
      !!phrase &&
      !(hideCaretWhenDone && progress >= 1) &&
      (progress < 1 || Math.floor((timeMs - phrase.startMs) / blinkMs) % 2 === 0);
    caretElement.style.opacity = visible ? '1' : '0';
    return text;
  };
  seek(0);
  return { seek };
}
