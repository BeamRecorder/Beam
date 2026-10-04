import {
  BACKGROUND_COLORS,
  BACKGROUND_GRADIENTS,
  gradientCssBackground,
} from "../../../apps/desktop/src/components/editor/composables/backgroundCatalog";
import { MACOS_CURSOR_PACK } from "../../../apps/desktop/src/components/editor/properties/cursor/cursor-packs";
import {
  resolveCursorAsset,
  cursorGeometry,
} from "../../../packages/engine/src/shared/cursor-assets";
import gate from "../assets/golden-gate-light.webp";
import trees from "../assets/mountaintrees.webp";
import sonoma from "../assets/sonoma-horizon.webp";
import ventura from "../assets/ventura.webp";
import tahoe from "../assets/tahoe-light.webp";
import sequoia from "../assets/sequoia-blue-orange.webp";
import clouds from "../assets/sonoma-clouds.webp";
import evening from "../assets/golden-gate-evening.webp";
import skyPoster from "../assets/wispysky.webp";
import sky from "../assets/wispysky.mp4";
import pointer from "../assets/macos-pointer.svg";

export const IMAGES = [
  { id: "golden-gate-light", name: "Golden Gate Light", url: gate },
  { id: "mountaintrees", name: "Mountain Trees", url: trees },
  { id: "sonoma-horizon", name: "Sonoma Horizon", url: sonoma },
  { id: "ventura", name: "Ventura", url: ventura },
  { id: "tahoe-light", name: "Tahoe Light", url: tahoe },
  { id: "sequoia-blue-orange", name: "Sequoia Blue Orange", url: sequoia },
  { id: "sonoma-clouds", name: "Sonoma Clouds", url: clouds },
  { id: "golden-gate-evening", name: "Golden Gate Evening", url: evening },
];
export const VIDEO = {
  id: "wispysky",
  name: "Wispy Sky",
  url: sky,
  poster: skyPoster,
};
export const COLORS = BACKGROUND_COLORS;
export const GRADIENTS = BACKGROUND_GRADIENTS.slice(0, 6);
export { gradientCssBackground, pointer };
export const POINTER_GEOMETRY = cursorGeometry(
  resolveCursorAsset(MACOS_CURSOR_PACK, {
    packId: MACOS_CURSOR_PACK.id,
    mode: "fixed",
    cursorId: "default",
  }),
  54,
);
