import { createApp, nextTick, reactive } from "vue";
import { createI18n } from "vue-i18n";
import enEditor from "../../../apps/desktop/src/i18n/en/editor.json";
import enCore from "../../../apps/desktop/src/i18n/en/core.json";
import Scene from "./Scene.vue";
import { clampTime, createMotion } from "./motion";
import type { DemoMode, DemoScene, DemoWindow } from "./demo-types";
import "./style.css";

const mode = document.documentElement.dataset.demoMode as DemoMode;
if (!["captions", "audio"].includes(mode))
  throw new Error("Choose a speech demo mode.");
const pose = reactive({ time: 0 });
const i18n = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  messages: { en: { ...enCore, ...enEditor } },
});
const scene = createApp(Scene, { mode, pose })
  .use(i18n)
  .mount("#app") as unknown as DemoScene;
const timeline = createMotion(pose),
  host = window as unknown as DemoWindow;
let controlled = false,
  initialized = false;
timeline.eventCallback("onUpdate", () => {
  if (initialized && !controlled) void nextTick().then(() => scene.paint());
});
host.__timelines = { ...host.__timelines, [`editing-${mode}`]: timeline };
const framesReady = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
const ready = (async () => {
  await scene.ready;
  await document.fonts.ready;
  await nextTick();
  scene.paint();
  await framesReady();
  initialized = true;
})();
host.beamComposition = {
  ready,
  timeline,
  async seek(timeMs) {
    await ready;
    controlled = true;
    try {
      timeline.seek(clampTime(timeMs), false);
      await nextTick();
      scene.paint();
      await framesReady();
    } finally {
      controlled = false;
    }
  },
};
