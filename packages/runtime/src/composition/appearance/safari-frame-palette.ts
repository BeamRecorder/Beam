import type { ClipFrameTheme } from '@beam/engine/shared/composition-types';

const LIGHT = {
  address: '#f7f7f7',
  border: '#d2d2d2',
  text: '#565656',
  icons: 'rgba(75, 75, 75, .93)',
  divider: 'rgba(213, 213, 213, .75)',
  outline: 'rgba(169, 169, 169, .75)',
};
const DARK = {
  address: '#303030',
  border: '#484848',
  text: '#e5e5e5',
  icons: 'rgba(235, 235, 235, .93)',
  divider: 'rgba(80, 80, 80, .75)',
  outline: 'rgba(100, 100, 100, .75)',
};

/** Document color decides Auto, so previews and exports do not depend on the app's UI theme. */
export function safariFramePalette(color: string, theme: ClipFrameTheme = 'auto') {
  if (!/^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/i.test(color)) throw new Error('Invalid Safari frame color.');
  const linear = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  const frame = luminance <= 0.179 ? DARK : LIGHT;
  const address = theme === 'auto' ? frame : theme === 'dark' ? DARK : LIGHT;
  // Toolbar icons contrast with the custom frame, independently of the address field's selected theme.
  return { ...frame, address: address.address, border: address.border, text: address.text };
}
