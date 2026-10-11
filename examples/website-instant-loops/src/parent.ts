import { gsap } from "gsap";
import nativeDocument from "../.beam/native-host.html?raw";
import { seekSeconds, contentOpacity } from "./motion";
import { heroSeconds, HERO_DURATION } from './hero-motion';
import "../../../apps/desktop/src/theme/palette.css";
import "../../../apps/desktop/src/theme/surfaces.css";
import type { DemoWindow } from "./demo-types";
const host = window as unknown as DemoWindow;
const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
const pose = { time: 0 };
const hero = document.documentElement.dataset.demoMode === 'hero';
const seconds = hero ? heroSeconds : seekSeconds;
const duration = hero ? HERO_DURATION : 8;
const timeline = gsap.timeline({ paused: true }).to(pose, {
  time: duration,
  duration,
  ease: "none",
  onUpdate: () => {
    const native = (frame.contentWindow as DemoWindow | null)?.beamNative;
    frame.style.opacity = String(hero ? 1 : contentOpacity(pose.time));
    if (native) void native.seek(pose.time * 1000);
  },
});
const nativeReady = new Promise<void>((resolve, reject) => {
  if ((frame.contentWindow as DemoWindow | null)?.beamNative) resolve();
  else
    frame.addEventListener(
      "load",
      () => {
        if ((frame.contentWindow as DemoWindow | null)?.beamNative) resolve();
        else reject(new Error("Native Beam host did not mount: " + frame.src));
      },
      { once: true },
    );
});
frame.srcdoc = nativeDocument;
const ready = (async () => {
  await nativeReady;
  await (frame.contentWindow as DemoWindow).beamNative!.ready;
})();
host.__timelines = { ...host.__timelines, instant: timeline };
host.beamComposition = {
  ready,
  timeline,
  async seek(timeMs) {
    await ready;
    timeline.seek(seconds(timeMs), true);
    frame.style.opacity = String(hero ? 1 : contentOpacity(seconds(timeMs)));
    await (frame.contentWindow as DemoWindow).beamNative!.seek(timeMs);
  },
};
