const historicalAppearance = (kind, showBackground) => ({
  cornerRadius: kind === 'screen' ? (showBackground ? 'md' : 'none') : 'sm',
  shadowSize: 'md',
  shadowBlur: kind === 'screen' ? 40 : 20,
  shadowMode: 'solid',
  shadowColor: '#000000',
  shadowDirection: kind === 'screen' ? 'bottom' : 'all',
  borderEnabled: false,
  borderColor: '#000000',
  borderWidth: 1,
  frame: 'none',
  frameTitle: '',
  frameColor: '#c0c0c0',
  frameShowMenu: true,
  frameShowScrollbars: true,
  frameChromeScale: 1,
});

module.exports = { historicalAppearance };
