const fixtures = require('./development-sources.json');

function developmentTargetBounds(source, display) {
  if (source.kind === 'screen') return { ...display };
  const maxWidth = Math.round(display.width * 0.68);
  const maxHeight = Math.round(display.height * 0.48);
  const width = Math.min(maxWidth, Math.round(maxHeight * source.aspect));
  const height = Math.min(maxHeight, Math.round(maxWidth / source.aspect));
  return {
    x: display.x + Math.round((display.width - width) / 2),
    y: display.y + 24,
    width,
    height,
  };
}

function createDevelopmentSourceProvider(display) {
  const sources = fixtures.map((source) => ({
    ...source,
    bounds: developmentTargetBounds(source, display),
  }));
  return {
    development: true,
    list: async () => sources.map((source) => ({ ...source })),
    preview: async (source) => ({
      bounds: source.bounds,
      thumbnail: null,
      warning: null,
    }),
  };
}

module.exports = { createDevelopmentSourceProvider, developmentTargetBounds };
