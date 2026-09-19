import type { ToastPreview } from '~/ui/toast/toastStore';
import type { ColorFill } from '~/media/shared/color-fill-types';
import type { CaptionClip, Clip, ShapeClip } from '~/media/shared/composition-types';
import type { ScreenshotLayerClipboard } from '../screenshot/screenshot-layer-clipboard-types';
import type { TimelineClipboardEntry, TimelineClipboardItem } from '../timeline/composables/timeline-clipboard-types';
import { isShapeKind, shapeDefinition } from '~/media/shared/shape-catalog';

const xml = (value: unknown) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const dataSvg = (content: string, background = '#15171c') =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64"><rect width="96" height="64" rx="6" fill="${xml(background)}"/>${content}</svg>`,
  )}`;

const preview = (src: string, alt: string, count = 1, kind: ToastPreview['kind'] = 'image'): ToastPreview => ({
  kind,
  src,
  alt,
  ...(count > 1 ? { count } : {}),
});

const fillMarkup = (fill: ColorFill | undefined, fallback: string) => {
  if (!fill || fill.kind === 'color') return { definition: '', value: fill?.color ?? fallback };
  const stops = fill.gradient.stops
    .map(
      (stop) => `<stop offset="${stop.position * 100}%" stop-color="${xml(stop.color)}" stop-opacity="${stop.alpha}"/>`,
    )
    .join('');
  const gradient =
    fill.gradient.type === 'radial'
      ? `<radialGradient id="fill">${stops}</radialGradient>`
      : `<linearGradient id="fill" gradientTransform="rotate(${fill.gradient.angle} .5 .5)">${stops}</linearGradient>`;
  return { definition: `<defs>${gradient}</defs>`, value: 'url(#fill)' };
};

const starPoints = Array.from({ length: 10 }, (_, index) => {
  const angle = -Math.PI / 2 + (index * Math.PI) / 5;
  const radius = index % 2 ? 13 : 25;
  return `${48 + Math.cos(angle) * radius},${32 + Math.sin(angle) * radius}`;
}).join(' ');

const freehandPath = (clip: ShapeClip) => {
  const points = clip.drawing?.points ?? [];
  if (!points.length) return 'M14 42 C28 15 42 50 55 24 S78 18 84 38';
  return points.map((point, index) => `${index ? 'L' : 'M'}${12 + point.x * 72} ${10 + point.y * 44}`).join(' ');
};

const shapeSvg = (clip: ShapeClip) => {
  const fill = fillMarkup(clip.fill, clip.fillColor);
  const fillValue =
    clip.fillEnabled === false || clip.family === 'arrow' || clip.family === 'drawing' ? 'none' : fill.value;
  const stroke = xml(
    clip.borderWidth > 0 ? clip.borderColor : clip.family === 'arrow' ? clip.fillColor : 'transparent',
  );
  const strokeWidth = Math.max(clip.family === 'arrow' ? 3 : 0, Math.min(7, clip.borderWidth / 2));
  const common = `fill="${xml(fillValue)}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"`;
  const catalog = clip.family === 'shape' && isShapeKind(clip.preset) ? shapeDefinition(clip.preset) : null;
  const catalogBody =
    catalog && !['rectangle', 'rounded-rectangle', 'ellipse', 'triangle', 'diamond', 'star'].includes(catalog.id)
      ? `<svg x="14" y="8" width="68" height="48" viewBox="${xml(catalog.viewBox)}" preserveAspectRatio="none"><path d="${xml(catalog.path)}" fill-rule="${catalog.fillRule ?? 'nonzero'}" ${common}/></svg>`
      : null;
  const body =
    clip.preset === 'ellipse'
      ? `<ellipse cx="48" cy="32" rx="31" ry="21" ${common}/>`
      : clip.preset === 'triangle'
        ? `<polygon points="48,9 82,53 14,53" ${common}/>`
        : clip.preset === 'diamond'
          ? `<polygon points="48,7 84,32 48,57 12,32" ${common}/>`
          : clip.preset === 'star'
            ? `<polygon points="${starPoints}" ${common}/>`
            : clip.preset === 'arrow'
              ? `<path d="M10 27 H58 V15 L86 32 58 49 V37 H10 Z" fill="${xml(clip.fillColor)}"/>`
              : clip.preset === 'text'
                ? `<text x="48" y="38" text-anchor="middle" fill="${xml(clip.text?.style.color ?? clip.fillColor)}" font-family="sans-serif" font-size="18" font-weight="700">${xml(clip.text?.content.trim().slice(0, 12) || 'Text')}</text>`
                : clip.preset === 'freehand'
                  ? `<path d="${freehandPath(clip)}" fill="none" stroke="${xml(clip.fillColor)}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
                  : (catalogBody ??
                    `<rect x="14" y="11" width="68" height="42" rx="${clip.preset === 'rounded-rectangle' ? 10 : 1}" ${common}/>`);
  return dataSvg(`${fill.definition}<g transform="rotate(${clip.rotation} 48 32)">${body}</g>`, '#20232a');
};

const captionSvg = (clip: CaptionClip) => {
  const text =
    clip.caption.type === 'text'
      ? clip.caption.style.customText || clip.caption.sentences.map((sentence) => sentence.text).join(' ')
      : clip.caption.steps.map((step) => step.key).join(' + ');
  return dataSvg(
    `<rect x="8" y="17" width="80" height="30" rx="7" fill="#000" fill-opacity=".72"/><text x="48" y="36" text-anchor="middle" fill="${xml(clip.caption.style.color)}" font-family="sans-serif" font-size="11" font-weight="700">${xml(text.trim().slice(0, 18) || 'Caption')}</text>`,
    '#30333b',
  );
};

const genericClipSvg = (clip: Clip) => {
  if (clip.kind === 'shape') return shapeSvg(clip);
  if (clip.kind === 'color') {
    const fill = fillMarkup(clip.fill, '#ff5a1f');
    return dataSvg(`${fill.definition}<rect x="7" y="7" width="82" height="50" rx="5" fill="${xml(fill.value)}"/>`);
  }
  if (clip.kind === 'caption') return captionSvg(clip);
  if (clip.kind === 'audio')
    return dataSvg(
      '<g fill="#ff6b35"><rect x="13" y="26" width="5" height="12" rx="2"/><rect x="23" y="18" width="5" height="28" rx="2"/><rect x="33" y="23" width="5" height="18" rx="2"/><rect x="43" y="12" width="5" height="40" rx="2"/><rect x="53" y="20" width="5" height="24" rx="2"/><rect x="63" y="16" width="5" height="32" rx="2"/><rect x="73" y="25" width="5" height="14" rx="2"/></g>',
    );
  if (clip.kind === 'blur')
    return dataSvg(
      '<defs><filter id="b"><feGaussianBlur stdDeviation="4"/></filter></defs><g filter="url(#b)"><circle cx="29" cy="27" r="17" fill="#ff6b35"/><rect x="45" y="15" width="35" height="34" rx="8" fill="#747bff"/></g><rect x="9" y="8" width="78" height="48" rx="8" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>',
    );
  return dataSvg(
    `<rect x="12" y="10" width="72" height="44" rx="6" fill="#252a34" stroke="#596273"/><path d="M40 23 L60 32 40 41 Z" fill="#ff6b35"/><text x="48" y="59" text-anchor="middle" fill="#c7cbd4" font-family="sans-serif" font-size="7">${xml(String(clip.kind ?? 'item').toUpperCase())}</text>`,
  );
};

const timelineEntryPreview = (entry: TimelineClipboardEntry, count: number): ToastPreview => {
  const alt =
    entry.type === 'zoom'
      ? `Zoom ${entry.descriptor.number}`
      : entry.clip.name || (entry.descriptor.kind === 'caption' ? entry.descriptor.text : entry.descriptor.name);
  if (entry.type === 'zoom')
    return preview(
      dataSvg(
        '<circle cx="41" cy="29" r="17" fill="none" stroke="#ff6b35" stroke-width="4"/><path d="M54 42 L75 55" stroke="#ff6b35" stroke-width="6" stroke-linecap="round"/><path d="M41 20 V38 M32 29 H50" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
      ),
      alt,
      count,
    );
  if (entry.asset?.src && entry.asset.kind === 'image') return preview(entry.asset.src, alt, count);
  if (entry.asset?.src && entry.asset.kind === 'video' && entry.clip.kind !== 'audio')
    return preview(entry.asset.src, alt, count, 'video');
  return preview(genericClipSvg(entry.clip), alt, count);
};

export const timelineClipboardPreview = (item: TimelineClipboardItem): ToastPreview => {
  if (item.type !== 'selection') return timelineEntryPreview(item, 1);
  const entry = item.entries[Math.min(item.primaryIndex, item.entries.length - 1)] ?? item.entries[0]!;
  return timelineEntryPreview(entry, item.entries.length);
};

export const screenshotClipboardPreview = (item: ScreenshotLayerClipboard): ToastPreview => {
  const entry = item.entries[Math.min(item.primaryIndex, item.entries.length - 1)] ?? item.entries[0]!;
  const count = item.entries.length;
  if (entry.layer.type === 'image') return preview(entry.layer.value.source, entry.name, count);
  if (entry.layer.type === 'shape') return preview(shapeSvg(entry.layer.value), entry.name, count);
  if (entry.layer.type === 'effect') return preview(genericClipSvg(entry.layer.value), entry.name, count);
  return preview(
    dataSvg(
      `<path d="M19 9 L70 37 49 41 61 56 51 61 40 45 27 58 Z" fill="${xml(entry.layer.value.color)}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`,
    ),
    entry.name,
    count,
  );
};
