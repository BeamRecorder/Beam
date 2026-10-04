/** Canvas metrics are relative to its current baseline; center the font box like a CSS line box. */
export function lineBoxBaselineOffset(metrics: Pick<TextMetrics, 'fontBoundingBoxAscent' | 'fontBoundingBoxDescent'>) {
  return (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
}
