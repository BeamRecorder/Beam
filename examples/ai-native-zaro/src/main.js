import { gsap } from 'gsap';
import { openingScenes } from './scenes-opening.js';
import { agentScenes } from './scenes-agents.js';
import { contextScenes } from './scenes-context.js';
import { fileScenes } from './scenes-files.js';
import { systemScenes } from './scenes-system.js';
import { placeScenes, createSceneRenderer } from './choreography.js';
import { compositionTime, createTextRenderer, DURATION } from './clock.js';
import { openingMotion } from './motion-opening.js';
import { agentMotion } from './motion-agents.js';
import { contextMotion } from './motion-context.js';
import { fileMotion } from './motion-files.js';
import { systemMotion } from './motion-system.js';
import './base.css';
import './agents.css';
import './context.css';
import './opening.css';
import './workplace.css';
import './system.css';

const root = document.querySelector('#composition');
root.innerHTML = openingScenes() + agentScenes() + contextScenes() + fileScenes() + systemScenes();
const timeline = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
placeScenes(timeline);
openingMotion(timeline);
agentMotion(timeline);
contextMotion(timeline);
fileMotion(timeline);
systemMotion(timeline);
timeline.to({}, { duration: 0.001 }, DURATION - 0.001);
const renderText = createTextRenderer(root);
const renderScene = createSceneRenderer(root);
window.__timelines = { 'ai-native-zaro': timeline };
window.beamComposition = {
  ready: Promise.all([document.fonts.ready, ...Array.from(document.images, (image) => image.decode())]),
  seek(timeMs) {
    const time = compositionTime(timeMs);
    timeline.time(time, false);
    renderText(time);
    renderScene(time);
  },
};
window.beamComposition.seek(0);
