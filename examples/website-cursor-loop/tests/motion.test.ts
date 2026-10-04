import { describe, expect, it } from "vitest";
import {
  clampTime,
  createMotion,
  initialPose,
  settingsAt,
  clickScaleAt,
  rippleFor,
  actionAt,
  stepAt,
  smooth,
  CLICKS,
  STEPS,
} from "../src/motion";
import { pointerAt, TELEMETRY } from "../src/telemetry";
import {
  cursorGeometry,
  resolveCursorAsset,
} from "../../../packages/engine/src/shared/cursor-assets";
import { GALLERIES, PACKS, CURSOR_IMAGES } from "../src/catalog";

describe("bounded, reversible render clock", () => {
  it.each([
    [-1, 0],
    [0, 0],
    [1234, 1.234],
    [12000, 12],
    [14000, 12],
    [NaN, 0],
    [Infinity, 0],
    [-Infinity, 0],
  ])("clamps %s", (value, expected) => expect(clampTime(value)).toBe(expected));
  it("does not retain another composition's pose", () => {
    const pose = initialPose();
    pose.time = 5;
    expect(initialPose()).toEqual({ time: 0 });
  });
  it.each([0, 2.5, 5.95, 9.1, 12])(
    "seeks directly and backwards to %s",
    (time) => {
      const pose = initialPose(),
        timeline = createMotion(pose);
      timeline.seek(time, false);
      expect(pose.time).toBeCloseTo(time);
      timeline.seek(12, false);
      timeline.seek(0, false);
      timeline.seek(time, false);
      expect(pose.time).toBeCloseTo(time);
      timeline.kill();
    },
  );
});
describe("complete native cursor packs", () => {
  it.each(GALLERIES)(
    "retains every role in $pack.name without duplicating artwork",
    (gallery) => {
      const roles = gallery.artwork.flatMap((entry) => entry.roles);
      expect(roles.sort()).toEqual(
        gallery.pack.cursors.map((cursor) => cursor.id).sort(),
      );
      expect(
        new Set(gallery.artwork.map((entry) => entry.asset.url)).size,
      ).toBe(gallery.artwork.length);
      expect(
        gallery.artwork.every(
          (entry) =>
            !/^\/(macOsSvgCursors|cursorPacks)\//.test(entry.asset.url),
        ),
      ).toBe(true);
    },
  );
  it("shows all 35 macOS and 54 unique Bibata artworks (84 roles)", () => {
    expect(
      GALLERIES.map((gallery) => [
        gallery.pack.cursors.length,
        gallery.artwork.length,
      ]),
    ).toEqual([
      [35, 35],
      [84, 54],
    ]);
    expect(CURSOR_IMAGES).toHaveLength(89);
  });
  it.each(STEPS)("resolves $role to native artwork in both packs", (step) => {
    for (const pack of PACKS) {
      const asset = resolveCursorAsset(
        pack,
        { packId: pack.id, mode: "automatic", cursorId: null },
        step.role,
      );
      expect(pack.cursors).toContain(asset);
      if (step.role !== "default")
        expect(asset.id).not.toBe(pack.defaultCursorId);
      const geometry = cursorGeometry(asset, 48);
      expect(geometry.hotspot.x).toBeCloseTo(
        (asset.hotspot.x * 48) / asset.nominalSize,
      );
      expect(geometry.hotspot.y).toBeCloseTo(
        (asset.hotspot.y * 48) / asset.nominalSize,
      );
    }
  });
});
describe("seek-safe showcase state", () => {
  it.each([
    [0, "builtin:macos"],
    [5.8, "builtin:bibata-material-noir"],
    [10.949, "builtin:bibata-material-noir"],
    [10.95, "builtin:macos"],
    [12, "builtin:macos"],
  ])("selects the native pack at %s", (time, id) =>
    expect(settingsAt(Number(time)).packId).toBe(id),
  );
  it("crossfades the full gallery and restores the exact opening settings", () => {
    expect(settingsAt(0)).toEqual(settingsAt(12));
    expect(settingsAt(5.94).mix).toBeCloseTo(0.5);
    expect(settingsAt(6.5)).toMatchObject({
      mix: 1,
      size: 48,
      rippleStyle: "double",
    });
    expect(settingsAt(11.09).mix).toBeCloseTo(0.5);
  });
  it.each([
    [-1, 0],
    [0, 0],
    [0.5, 0.5],
    [1, 1],
    [2, 1],
  ])("bounds the eased phase %s", (p, v) => expect(smooth(p)).toBe(v));
  it("types, moves, resizes and returns to the opening action", () => {
    expect(stepAt(-1)).toEqual(STEPS[0]);
    expect(actionAt(2.5).text).toBe("Make it yours.");
    expect(actionAt(3.15).x).toBeCloseTo(24);
    expect(actionAt(3.8).width).toBe(148);
    expect(actionAt(4.5).width).toBe(196);
    expect(actionAt(12).step.role).toBe("default");
    expect(actionAt(12).width).toBe(actionAt(0).width);
  });
});
describe("native click spring and ripples", () => {
  it.each([0, 0.94, 12])("is settled outside click windows at %s", (time) =>
    expect(clickScaleAt(time)).toBe(1),
  );
  it("compresses, rebounds and settles without retained state", () => {
    expect(clickScaleAt(1)).toBeLessThan(1);
    const value = clickScaleAt(1.08);
    clickScaleAt(11);
    expect(clickScaleAt(1.08)).toBe(value);
    expect(clickScaleAt(1.5)).toBe(1);
  });
  it("does not draw rings outside their lifespan", () => {
    expect(rippleFor(0.5, CLICKS[0])).toBeNull();
    expect(rippleFor(1.7, CLICKS[0])).toBeNull();
  });
  it("uses actual single and double ring recipes", () => {
    expect(rippleFor(1.05, CLICKS[0])!.rings).toHaveLength(1);
    expect(rippleFor(6.85, CLICKS[2])!.rings).toHaveLength(2);
  });
});
describe("authored input through the real cursor player", () => {
  it("starts at the authored parked point", () => {
    expect(pointerAt(0).x).toBeCloseTo(337 / 640);
    expect(pointerAt(0).y).toBeCloseTo(139 / 400);
    expect(pointerAt(0).cursorKind).toBe("default");
  });
  it.each(CLICKS)("lands the hotspot on $target at $at", (click) => {
    const p = pointerAt(click.at);
    expect(p.x * 640).toBeCloseTo(click.x);
    expect(p.y * 400).toBeCloseTo(click.y);
    expect(p.cursorKind).toBe("handpointing");
  });
  it.each([
    [2.2, "textcursor"],
    [3.2, "move"],
    [4.2, "resizewesteast"],
    [5.1, "cross"],
    [7.9, "textcursor"],
    [9, "resizenorthwestsoutheast"],
    [9.8, "notallowed"],
    [10.4, "help"],
  ])("changes the actual pointer role at %s", (time, role) =>
    expect(pointerAt(Number(time)).cursorKind).toBe(role),
  );
  it.each([0.4, 1.4, 3.4, 5.95, 8.9, 11.5])(
    "reproduces samples after a reverse seek at %s",
    (time) => {
      const first = pointerAt(time);
      pointerAt(12);
      pointerAt(0);
      expect(pointerAt(time)).toEqual(first);
    },
  );
  it("restores the exact opening pointer at the loop seam", () => {
    expect(pointerAt(11.85)).toEqual(pointerAt(0));
    expect(pointerAt(12)).toEqual(pointerAt(0));
  });
  it("keeps all inputs bounded and ordered", () => {
    let previous = -1;
    for (const event of TELEMETRY) {
      expect(event.sessionNs).toBeGreaterThanOrEqual(previous);
      previous = event.sessionNs;
      if ("normalizedX" in event) {
        expect(event.normalizedX).toBeGreaterThanOrEqual(0);
        expect(event.normalizedX).toBeLessThanOrEqual(1);
        expect(event.normalizedY).toBeGreaterThanOrEqual(0);
        expect(event.normalizedY).toBeLessThanOrEqual(1);
      }
    }
  });
});
