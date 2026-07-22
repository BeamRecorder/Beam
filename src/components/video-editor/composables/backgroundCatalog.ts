import publicBackgroundPaths from "virtual:public-background-media";

export type BackgroundKind = "image" | "video" | "color" | "gradient";
export type BackgroundMediaKind = Extract<BackgroundKind, "image" | "video">;

export interface GradientStop { id: string; position: number; color: string; alpha: number }
export interface GradientBackground { type: "linear" | "radial"; angle: number; stops: GradientStop[] }
export interface BackgroundMedia { id: string; name: string; path: string; extension: string; kind: BackgroundMediaKind; fileName?: string }
export interface ColorBackground { id: string; name: string; kind: "color"; color: string }
export interface GradientCatalogBackground { id: string; name: string; kind: "gradient"; gradient: GradientBackground }
export type BackgroundEntry = BackgroundMedia | ColorBackground | GradientCatalogBackground;
export type BackgroundValue = BackgroundMedia | ColorBackground | GradientCatalogBackground;
export interface BackgroundMediaGroup { kind: BackgroundMediaKind; label: string; items: BackgroundMedia[] }

const mediaKinds: Record<string, BackgroundMediaKind> = { avif: "image", bmp: "image", jpeg: "image", jpg: "image", png: "image", webp: "image", m4v: "video", mov: "video", mp4: "video", ogv: "video", webm: "video" };
const labels: Record<BackgroundMediaKind, string> = { image: "Images", video: "Videos" };
const defaultGradient: GradientBackground = { type: "linear", angle: 135, stops: [{ id: "start", position: 0, color: "#4f46e5", alpha: 1 }, { id: "end", position: 1, color: "#ec4899", alpha: 1 }] };

const extensionFor = (path: string) => path.slice(path.lastIndexOf(".") + 1).toLowerCase();
const nameFor = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const hex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export const backgroundKindFor = (path: string): BackgroundMediaKind | null => mediaKinds[extensionFor(path)] ?? null;
export const createBackgroundMedia = (paths: readonly string[]): BackgroundMedia[] => [...new Set(paths)].flatMap((path) => {
  const kind = backgroundKindFor(path); if (!kind) return [];
  return [{ id: path, name: nameFor(path), path, extension: extensionFor(path), kind }];
}).sort((left, right) => left.name.localeCompare(right.name));
export const groupBackgroundMedia = (media: readonly BackgroundMedia[]): BackgroundMediaGroup[] => (Object.keys(labels) as BackgroundMediaKind[]).map((kind) => ({ kind, label: labels[kind], items: media.filter((item) => item.kind === kind) })).filter((group) => group.items.length > 0);

export const normalizeGradient = (value: unknown): GradientBackground => {
  const candidate = value && typeof value === "object" ? value as Partial<GradientBackground> : {};
  const rawStops = Array.isArray(candidate.stops) ? candidate.stops : defaultGradient.stops;
  const stops = rawStops.map((stop, index) => {
    const item = stop as Partial<GradientStop>; const position = Number(item.position);
    return { id: typeof item.id === "string" && item.id ? item.id : `stop-${index}`, position: clamp(Number.isFinite(position) ? position : index / Math.max(1, rawStops.length - 1)), color: hex(item.color) ? item.color : "#ffffff", alpha: clamp(Number.isFinite(Number(item.alpha)) ? Number(item.alpha) : 1) };
  }).sort((a, b) => a.position - b.position);
  return { type: candidate.type === "radial" ? "radial" : "linear", angle: Number.isFinite(Number(candidate.angle)) ? ((Number(candidate.angle) % 360) + 360) % 360 : defaultGradient.angle, stops: stops.length >= 2 ? stops : structuredClone(defaultGradient.stops) };
};
export const normalizeBackgroundValue = (value: unknown): BackgroundValue | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<BackgroundEntry>;
  if ((entry.kind === "image" || entry.kind === "video") && typeof entry.path === "string" && backgroundKindFor(entry.path) === entry.kind) return { id: typeof entry.id === "string" ? entry.id : entry.path, name: typeof entry.name === "string" ? entry.name : nameFor(entry.path), path: entry.path, extension: extensionFor(entry.path), kind: entry.kind, ...(typeof entry.fileName === "string" ? { fileName: entry.fileName } : {}) };
  if (entry.kind === "color" && hex(entry.color)) return { id: typeof entry.id === "string" ? entry.id : `color:${entry.color.toLowerCase()}`, name: typeof entry.name === "string" ? entry.name : entry.color, kind: "color", color: entry.color };
  if (entry.kind === "gradient") return { id: typeof entry.id === "string" ? entry.id : "gradient:custom", name: typeof entry.name === "string" ? entry.name : "Custom gradient", kind: "gradient", gradient: normalizeGradient(entry.gradient) };
  return null;
};
export const BACKGROUND_MEDIA = createBackgroundMedia(publicBackgroundPaths);
export const BACKGROUND_COLORS: ColorBackground[] = ["#111827", "#ffffff", "#0f766e", "#1d4ed8", "#7c3aed", "#be123c"].map((color) => ({ id: `color:${color}`, name: color, kind: "color", color }));
export const BACKGROUND_GRADIENTS: GradientCatalogBackground[] = [
  { id: "gradient:violet", name: "Violet", kind: "gradient", gradient: defaultGradient },
  { id: "gradient:ocean", name: "Ocean", kind: "gradient", gradient: { type: "linear", angle: 120, stops: [{ id: "a", position: 0, color: "#0f172a", alpha: 1 }, { id: "b", position: 1, color: "#06b6d4", alpha: 1 }] } },
];
export const customColor = (color: string): ColorBackground => ({ id: `color:custom:${color.toLowerCase()}`, name: "Custom color", kind: "color", color });
export const customGradient = (gradient: GradientBackground): GradientCatalogBackground => ({ id: "gradient:custom", name: "Custom gradient", kind: "gradient", gradient: normalizeGradient(gradient) });
