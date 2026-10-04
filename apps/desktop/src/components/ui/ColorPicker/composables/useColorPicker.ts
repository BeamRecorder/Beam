export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSV {
  h: number;
  s: number;
  v: number;
}

export function useColorPicker() {
  // Helper: Hex to RGB
  function hexToRgb(hex: string): RGB {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1] ?? '', 16),
          g: parseInt(result[2] ?? '', 16),
          b: parseInt(result[3] ?? '', 16),
        }
      : { r: 0, g: 0, b: 0 };
  }

  // Helper: RGB to Hex
  function rgbToHex(r: number, g: number, b: number): string {
    return (
      '#' +
      [r, g, b]
        .map((x) => {
          const hex = Math.round(x).toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        })
        .join('')
    );
  }

  // Helper: RGB to HSV
  function rgbToHsv(r: number, g: number, b: number): HSV {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hValue = 0;
    let sValue = 0;
    const vValue = max;

    const d = max - min;
    sValue = max === 0 ? 0 : d / max;

    if (max !== min) {
      switch (max) {
        case r:
          hValue = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          hValue = (b - r) / d + 2;
          break;
        case b:
          hValue = (r - g) / d + 4;
          break;
      }
      hValue /= 6;
    }
    return { h: hValue * 360, s: sValue * 100, v: vValue * 100 };
  }

  // Helper: HSV to RGB
  function hsvToRgb(h: number, s: number, v: number): RGB {
    h /= 360;
    s /= 100;
    v /= 100;
    let r = 0,
      g = 0,
      b = 0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0:
        ((r = v), (g = t), (b = p));
        break;
      case 1:
        ((r = q), (g = v), (b = p));
        break;
      case 2:
        ((r = p), (g = v), (b = t));
        break;
      case 3:
        ((r = p), (g = q), (b = v));
        break;
      case 4:
        ((r = t), (g = p), (b = v));
        break;
      case 5:
        ((r = v), (g = p), (b = q));
        break;
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  return {
    hexToRgb,
    rgbToHex,
    rgbToHsv,
    hsvToRgb,
  };
}
