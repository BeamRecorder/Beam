export type CursorClickButton = "left" | "right";

export interface CursorClickEffectSettings {
  springEnabled: boolean;
  springIntensity: number;
  rippleEnabled: boolean;
  rippleSize: number;
  rippleColor: string;
}

export interface CursorClickEffects {
  left: CursorClickEffectSettings;
  right: CursorClickEffectSettings;
}

const DEFAULT_LEFT: CursorClickEffectSettings = {
  springEnabled: true,
  springIntensity: 100,
  rippleEnabled: true,
  rippleSize: 30,
  rippleColor: "#ff5a1f",
};

const DEFAULT_RIGHT: CursorClickEffectSettings = {
  springEnabled: true,
  springIntensity: 100,
  rippleEnabled: true,
  rippleSize: 30,
  rippleColor: "#6366f1",
};

export const createDefaultCursorClickEffects = (): CursorClickEffects => ({
  left: { ...DEFAULT_LEFT },
  right: { ...DEFAULT_RIGHT },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const booleanValue = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const stringValue = (value: unknown, fallback: string) =>
  typeof value === "string" && value ? value : fallback;

const normalizeEffect = (
  value: unknown,
  fallback: CursorClickEffectSettings,
): CursorClickEffectSettings => {
  const input = isRecord(value) ? value : {};
  return {
    springEnabled: booleanValue(input.springEnabled, fallback.springEnabled),
    springIntensity: Math.min(100, Math.max(0, finiteNumber(input.springIntensity, fallback.springIntensity))),
    rippleEnabled: booleanValue(input.rippleEnabled, fallback.rippleEnabled),
    rippleSize: Math.min(80, Math.max(10, finiteNumber(input.rippleSize, fallback.rippleSize))),
    rippleColor: stringValue(input.rippleColor, fallback.rippleColor),
  };
};

export const normalizeCursorClickEffects = (value: unknown): CursorClickEffects => {
  const input = isRecord(value) ? value : {};
  return {
    left: normalizeEffect(input.left, DEFAULT_LEFT),
    right: normalizeEffect(input.right, DEFAULT_RIGHT),
  };
};

export const clickButtonForRecordedButton = (button: number): "left" | "right" | "middle" | null => {
  if (button === 1) return "left";
  if (button === 2) return "right";
  if (button === 3) return "middle";
  return null;
};

/** Middle-click keeps the historical left-click visual treatment. */
export const effectButtonForRecordedButton = (button: number): CursorClickButton | null => {
  const recordedButton = clickButtonForRecordedButton(button);
  if (recordedButton === "right") return "right";
  if (recordedButton === "left" || recordedButton === "middle") return "left";
  return null;
};
