const withoutInheritedKeyboardText = (clip) => {
  if (clip?.kind !== 'caption' || clip.caption?.type !== 'keyboard' || !clip.caption.style) return clip;
  const { customText: _customText, ...style } = clip.caption.style;
  return { ...clip, caption: { ...clip.caption, style } };
};

const withHistoricalTypography = (clip) =>
  clip.kind === 'caption'
    ? {
        ...clip,
        caption: {
          ...clip.caption,
          style: {
            ...clip.caption.style,
            fontFamily: 'sans-serif',
            fontWeight: 800,
            fontStyle: 'normal',
            textDecoration: 'none',
            textAlign: 'center',
            lineHeight: 1.2,
            letterSpacing: 0,
          },
        },
      }
    : clip;

module.exports = { withoutInheritedKeyboardText, withHistoricalTypography };
