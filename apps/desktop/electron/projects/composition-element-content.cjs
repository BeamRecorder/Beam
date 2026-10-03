const { normalizeCaptionStyle } = require('./composition-captions.cjs');
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function normalizeElementContent(value) {
  const result = {};
  if (value.text !== undefined) {
    const text = value.text;
    if (
      !text ||
      typeof text.content !== 'string' ||
      text.content.length > 10000 ||
      !finite(text.padding) ||
      text.padding < 0 ||
      text.padding > 40 ||
      !['top', 'center', 'bottom'].includes(text.verticalAlign)
    )
      throw new Error('Invalid element text.');
    result.text = {
      content: text.content,
      padding: text.padding,
      verticalAlign: text.verticalAlign,
      style: normalizeCaptionStyle(text.style),
    };
  }
  if (value.drawing !== undefined) {
    const drawing = value.drawing;
    if (
      !drawing ||
      !Array.isArray(drawing.points) ||
      !drawing.points.length ||
      drawing.points.length > 8192 ||
      !drawing.points.every((p) => p && [p.x, p.y].every((v) => finite(v) && v >= 0 && v <= 1)) ||
      !finite(drawing.smoothing) ||
      drawing.smoothing < 0 ||
      drawing.smoothing > 100 ||
      !finite(drawing.strokeWidth) ||
      drawing.strokeWidth < 1 ||
      drawing.strokeWidth > 120
    )
      throw new Error('Invalid freehand drawing.');
    result.drawing = {
      points: drawing.points.map((p) => ({ x: p.x, y: p.y })),
      smoothing: drawing.smoothing,
      strokeWidth: drawing.strokeWidth,
    };
  }
  if ((value.family === 'text' && !result.text) || (value.family === 'drawing' && !result.drawing))
    throw new Error('Missing element content.');
  return result;
}
module.exports = { normalizeElementContent };
