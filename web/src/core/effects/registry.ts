import type { EffectDocument, EffectFrame, EffectType } from '../types';
import { computeFrame as computeRotatingBarrageFrame } from './rotatingBarrage';

/**
 * Every effect type (future: lightning, slash, explosion, magic circle, ...)
 * registers a pure `computeFrame(doc, time) -> EffectFrame` function here.
 * This is the only seam the renderer and UI need to know about to support a
 * new effect type — add a module next to rotatingBarrage.ts and register it
 * below.
 */
type FrameComputer = (doc: EffectDocument, time: number) => EffectFrame;

const registry: Record<EffectType, FrameComputer> = {
  rotating_barrage: computeRotatingBarrageFrame,
};

export function computeEffectFrame(doc: EffectDocument, time: number): EffectFrame {
  const computer = registry[doc.effectType];
  if (!computer) {
    throw new Error(`Unknown effectType: ${doc.effectType}`);
  }
  return computer(doc, time);
}
