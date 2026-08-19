export function svgAtRasterSize(svg: string, width: number, height: number, color: string, tintable: boolean) {
  const tintReadySvg = tintable
    ? svg
        .replace(
          /(fill|stroke|stop-color)\s*=\s*(["'])(?:#000(?:000)?|#231f(?:1f|20)|black)\2/gi,
          '$1=$2currentColor$2',
        )
        .replace(
          /((?:fill|stroke|stop-color)\s*:\s*)(?:#000(?:000)?|#231f(?:1f|20)|black)(?=\s*(?:;|["']))/gi,
          '$1currentColor',
        )
    : svg;
  return tintReadySvg.replace(/<svg\b([^>]*)>/i, (_tag, attributes: string) => {
    const clean = attributes.replace(/\s(?:width|height)=["'][^"']*["']/gi, '');
    const rootStyle = clean.match(/\sstyle\s*=\s*(["'])(.*?)\1/i)?.[2];
    const hasRootFill = /(?:^|\s)fill\s*=/i.test(clean) || /(?:^|;)\s*fill\s*:/i.test(rootStyle ?? '');
    const inheritedTintFill = tintable && !hasRootFill ? ' fill="currentColor"' : '';
    return (
      `<svg${clean} width="${Math.max(1, Math.ceil(width))}" height="${Math.max(1, Math.ceil(height))}"` +
      (tintable ? ` color="${color}"${inheritedTintFill}` : '') +
      '>'
    );
  });
}
