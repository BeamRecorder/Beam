import { createTimeline } from './timeline';
import { compositionTime } from './clock';
import './composition-types';
import officialPlate from '../references/screenshots/edits-assistant-official.png';

document.querySelectorAll('svg image').forEach(image => image.setAttribute('href', officialPlate));
const timeline = createTimeline();
window.aiNativeTimeline = timeline;
window.beamComposition = {
  ready: Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.decode())]),
  seek(timeMs) { timeline.time(compositionTime(timeMs), false); },
};
timeline.time(0, false);
