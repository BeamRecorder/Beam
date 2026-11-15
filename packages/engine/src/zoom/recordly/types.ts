export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6;

export interface ZoomFocus {
	cx: number; // normalized horizontal center (0-1)
	cy: number; // normalized vertical center (0-1)
}

export type ZoomMode = "auto" | "manual";

export interface ZoomRegion {
	id: string;
	startMs: number;
	endMs: number;
	depth: ZoomDepth;
	focus: ZoomFocus;
	/** Telemetry targets use source coordinates; editor-picked targets use the cropped viewport. */
	focusSpace?: "source" | "viewport";
	mode?: ZoomMode;
}

export interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
	pressure?: number;
	interactionType?:
		| "move"
		| "click"
		| "double-click"
		| "right-click"
		| "middle-click"
		| "mouseup";
	/** Button whose down/up transition this sample records. */
	mouseButton?: 1 | 2 | 3;
	cursorType?:
		| "arrow"
		| "text"
		| "pointer"
		| "crosshair"
		| "open-hand"
		| "closed-hand"
		| "resize-ew"
		| "resize-ns"
		| "not-allowed";
}

export const DEFAULT_CURSOR_CLICK_BOUNCE = 2.5;

export const DEFAULT_CURSOR_CLICK_BOUNCE_DURATION = 230;

export interface ZoomMotionBlurTuning {
	panVelocityThreshold: number;
	zoomVelocityThreshold: number;
	maxDirectionalBlurPx: number;
	maxRadialBlurStrength: number;
	panResponsePerSecond: number;
	zoomResponsePerSecond: number;
	zoomSafeZoneRadiusPx: number;
}

export const DEFAULT_ZOOM_MOTION_BLUR_TUNING: ZoomMotionBlurTuning = {
	panVelocityThreshold: 0,
	zoomVelocityThreshold: 0,
	maxDirectionalBlurPx: 41.8,
	maxRadialBlurStrength: 1,
	panResponsePerSecond: 11,
	zoomResponsePerSecond: 9,
	zoomSafeZoneRadiusPx: 6,
};

export const DEFAULT_ZOOM_IN_DURATION_MS = 1522.575;

export const DEFAULT_ZOOM_OUT_DURATION_MS = 1015.05;

export const DEFAULT_CONNECTED_ZOOM_GAP_MS = 1500;

export const DEFAULT_CONNECTED_ZOOM_DURATION_MS = 1000;

export interface TrimRegion {
	id: string;
	startMs: number;
	endMs: number;
}

export interface ClipRegion {
	id: string;
	/** Where the clip sits on the timeline. */
	startMs: number;
	/** Where the clip ends on the timeline (`startMs` + source duration / speed). */
	endMs: number;
	/**
	 * Where the clip reads from in the recording. Defaults to `startMs`, which is
	 * only the same thing while everything before it plays at 1x — splitting or
	 * left-trimming a sped-up clip moves the source in without moving the clip.
	 */
	sourceStartMs?: number;
	/** Bounds of this recording within the shared media source. */
	sourceMinMs?: number;
	sourceMaxMs?: number;
	speed: number;
	muted?: boolean;
	showSourceAudio?: boolean;
}

export function getClipSourceStartMs(clip: ClipRegion): number {
	return Number.isFinite(clip.sourceStartMs) ? (clip.sourceStartMs as number) : clip.startMs;
}

export function getClipSourceEndMs(clip: ClipRegion): number {
	const displayDurationMs = Math.max(0, clip.endMs - clip.startMs);
	const speed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
	return Math.round(getClipSourceStartMs(clip) + displayDurationMs * speed);
}

export function sortClipRegions(clips: ClipRegion[]): ClipRegion[] {
	return [...clips].sort((left, right) => left.startMs - right.startMs);
}

function getSafeClipSpeed(clip: ClipRegion) {
	return Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
}

function mapNearestClipBoundary(timeMs: number, clips: ClipRegion[], from: "timeline" | "source") {
	let nearestTimeMs = Math.round(timeMs);
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (const clip of clips) {
		const boundaries = [
			[clip.startMs, getClipSourceStartMs(clip)],
			[clip.endMs, getClipSourceEndMs(clip)],
		];

		for (const [timelineTimeMs, sourceTimeMs] of boundaries) {
			const inputTimeMs = from === "timeline" ? timelineTimeMs : sourceTimeMs;
			const distance = Math.abs(timeMs - inputTimeMs);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestTimeMs = Math.round(from === "timeline" ? sourceTimeMs : timelineTimeMs);
			}
		}
	}

	return nearestTimeMs;
}

export function mapTimelineTimeToSourceTime(timeMs: number, clips: ClipRegion[]): number {
	const roundedTimeMs = Math.round(timeMs);
	const sortedClips = sortClipRegions(clips);

	for (const clip of sortedClips) {
		if (timeMs < clip.startMs || timeMs >= clip.endMs) {
			continue;
		}

		return Math.round(
			getClipSourceStartMs(clip) + (roundedTimeMs - clip.startMs) * getSafeClipSpeed(clip),
		);
	}

	if (sortedClips.length === 0) {
		return roundedTimeMs;
	}

	return mapNearestClipBoundary(roundedTimeMs, sortedClips, "timeline");
}

export function findClipAtTimelineTime(timeMs: number, clips: ClipRegion[]): ClipRegion | null {
	return (
		sortClipRegions(clips).find((clip) => timeMs >= clip.startMs && timeMs < clip.endMs) ?? null
	);
}

export interface CropRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
	1: 1.25,
	2: 1.5,
	3: 1.8,
	4: 2.2,
	5: 3.5,
	6: 5.0,
};

export function clampFocusToDepth(focus: ZoomFocus, _depth: ZoomDepth): ZoomFocus {
	return {
		cx: clamp(focus.cx, 0, 1),
		cy: clamp(focus.cy, 0, 1),
	};
}

function clamp(value: number, min: number, max: number) {
	if (Number.isNaN(value)) return (min + max) / 2;
	return Math.min(max, Math.max(min, value));
}
