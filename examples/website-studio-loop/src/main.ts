import { createApp, nextTick, reactive } from "vue";
import { createI18n } from "vue-i18n";
import enCore from "../../../apps/desktop/src/i18n/en/core.json";
import enEditor from "../../../apps/desktop/src/i18n/en/editor.json";
import Scene from "./Scene.vue";
import { clampTime, createMotion, modeAt } from "./motion";
import type {
  DemoTheme,
  DemoWindow,
  HyperframesSeekDetail,
  SceneHandle,
} from "./demo-types";
import "./style.css";
import { compositionAt, snapshotAt } from "./scene-model";
const pose = reactive({ time: 0 });
const theme = document.documentElement.dataset.demoTheme as DemoTheme;
const scene = createApp(Scene, { pose, theme })
  .use(
    createI18n({
      legacy: false,
      locale: "en",
      messages: { en: { ...enCore, ...enEditor } },
    }),
  )
  .mount("#app") as unknown as SceneHandle;
const timeline = createMotion(pose),
  host = window as unknown as DemoWindow;
host.__timelines = { ...host.__timelines, "studio-overview": timeline };
host.studioDocument = {
  composition: compositionAt(13.5),
  snapshot: snapshotAt(13.5),
};
const settle = async () => {
  // CSS reveals are frozen by the build; Vue's flush is the render barrier.
  // A frame wait here would deadlock HyperFrames' frozen animation clock.
  await nextTick();
};
async function disclosure(label: string, desired: boolean) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>("button.accordion-trigger"),
  ].find((button) => button.textContent?.trim() === label);
  if (button && (button.getAttribute("aria-expanded") === "true") !== desired) {
    button.click();
    await settle();
  }
}
function annotateScrollClipping() {
  // Native scroll clipping is intentional; labels below its viewport cannot occlude the timeline.
  const scroll = document.querySelector<HTMLElement>(".inspector-scroll")!;
  const visible = scroll.getBoundingClientRect();
  for (const node of scroll.querySelectorAll<HTMLElement>(
    "span,label,p,input,button",
  )) {
    const rect = node.getBoundingClientRect();
    if (rect.top < visible.top || rect.bottom > visible.bottom)
      node.setAttribute("data-layout-allow-occlusion", "true");
    else node.removeAttribute("data-layout-allow-occlusion");
  }
}
const ready = (async () => {
  await settle();
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode()));
  await scene.ready;
  annotateScrollClipping();
})();
host.beamComposition = {
  ready,
  timeline,
  async seek(ms) {
    await ready;
    timeline.seek(clampTime(ms), false);
    await nextTick();
    const mode = modeAt(pose.time);
    await disclosure("Placement", mode === "clip" || mode === "size");
    await disclosure("Drop Shadow", mode === "shadow");
    await disclosure("Layout", false);
    await disclosure("Crop", false);
    const scroll = document.querySelector<HTMLElement>(".inspector-scroll")!;
    scroll.scrollTop = 0;
    if (mode === "shadow") {
      const heading = document.querySelector<HTMLElement>(
        '[data-clip-section="shadow"]',
      )!;
      const scale =
        document.querySelector(".inspector")!.getBoundingClientRect().width /
        290;
      scroll.scrollTop =
        (heading.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top) /
          scale -
        8;
    }
    const caption = document.querySelector<HTMLInputElement>(
      ".caption-clip-panel input",
    );
    if (caption) caption.value = caption.getAttribute("value") || caption.value;
    await settle();
    for (const animation of document.getAnimations()) animation.finish();
    await settle();
    await scene.paint();
    await settle();
    annotateScrollClipping();
  },
};
// The runtime awaits work registered synchronously on its seek event.
host.addEventListener("hf-seek", (event) => {
  const detail = (event as CustomEvent<HyperframesSeekDetail>).detail;
  detail.waitUntil(host.beamComposition.seek(detail.time * 1000));
});
