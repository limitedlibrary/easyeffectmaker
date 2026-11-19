import './style.css';
import { AppState } from './state/AppState';
import { EffectRenderer } from './render/EffectRenderer';
import { computeEffectFrame } from './core/effects/registry';
import { Panel } from './ui/Panel';
import { Timeline } from './ui/Timeline';
import { WarningBanner } from './ui/WarningBanner';

const state = new AppState();

const viewport = document.getElementById('viewport') as HTMLElement;
const sidebar = document.getElementById('sidebar') as HTMLElement;
const transportHost = document.getElementById('transport-host') as HTMLElement;

const renderer = new EffectRenderer(viewport);

const warningBanner = new WarningBanner();
viewport.appendChild(warningBanner.el);

const panel = new Panel(state, {
  isFreeCamera: () => renderer.isFreeCamera(),
  setFreeCamera: (v: boolean) => renderer.setFreeCamera(v, state.doc),
});
sidebar.appendChild(panel.el);

const timeline = new Timeline(state);
transportHost.appendChild(timeline.el);

// Mobile tab switching (viewport <-> settings). Pure CSS class toggle; has no effect on wide screens.
const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.mobile-tab'));
const layoutEl = document.getElementById('layout') as HTMLElement;
for (const btn of tabButtons) {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
    layoutEl.dataset.activeTab = btn.dataset.tab;
  });
}
layoutEl.dataset.activeTab = 'viewport';

window.addEventListener('resize', () => renderer.resize());

let lastTimestamp = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - lastTimestamp) / 1000);
  lastTimestamp = now;

  state.advance(dt);
  const effectFrame = computeEffectFrame(state.doc, state.playback.time);
  renderer.render(state.doc, effectFrame);
  warningBanner.update(renderer.getLastStats());
  timeline.tick();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
