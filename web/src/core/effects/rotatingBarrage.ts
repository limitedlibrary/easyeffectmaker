import type {
  BulletState,
  BulletTrail,
  EffectDocument,
  EffectFrame,
  EffectLayer,
  FlashEvent,
  TrailSample,
  Vec3,
} from '../types';
import { hashToSigned, RandomSalt } from '../random';
import {
  clamp,
  coneDirection,
  kinematicPosition,
  lerpColor,
  normalize,
  rotateAroundAxis,
} from '../math';

export const TRAIL_SAMPLES = 8;

/** Deterministic string -> int32 hash, used to fold a layer id into the RNG key. See docs/json-spec.md. */
export function stringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

interface ResolvedBullet {
  shotIndex: number;
  bulletIndex: number;
  age: number;
  dir: Vec3;
  speed: number;
  accel: number;
}

/** Shot index range (inclusive) whose bullets can still be alive at time `t`. */
function shotIndexRange(
  localT: number,
  interval: number,
  lifetime: number,
  emissionDuration: number,
): [number, number] {
  const safeInterval = Math.max(interval, 1e-6);
  const maxShotTime = Math.min(localT, emissionDuration);
  if (maxShotTime < 0) return [0, -1]; // empty range
  const sMax = Math.floor(maxShotTime / safeInterval + 1e-9);
  const sMin = Math.max(0, Math.ceil((localT - lifetime) / safeInterval - 1e-9));
  return [sMin, sMax];
}

function resolveBullet(
  doc: EffectDocument,
  layer: EffectLayer,
  layerKey: number,
  shotIndex: number,
  bulletIndex: number,
  age: number,
): ResolvedBullet {
  const { emitter, bullet } = layer;
  const shotTime = layer.startDelaySec + shotIndex * emitter.interval;

  const baseDir = normalize(emitter.direction);
  const steadyDir = rotateAroundAxis(baseDir, emitter.rotationAxis, emitter.rotationSpeedDeg * shotTime);
  const waveAngle = emitter.waveAmplitudeDeg * Math.sin(2 * Math.PI * emitter.waveFrequencyHz * shotTime);
  const centralDir = rotateAroundAxis(steadyDir, emitter.waveAxis, waveAngle);

  const count = Math.max(1, emitter.count);
  const baseAzimuth = (360 / count) * bulletIndex;
  const jitterAz = hashToSigned(doc.seed, layerKey, shotIndex, bulletIndex, RandomSalt.AZIMUTH) * emitter.azimuthJitterDeg;
  const jitterSpread = hashToSigned(doc.seed, layerKey, shotIndex, bulletIndex, RandomSalt.SPREAD) * emitter.spreadJitterDeg;
  const halfAngle = Math.max(0, emitter.spreadAngleDeg / 2 + jitterSpread);
  const azimuth = baseAzimuth + jitterAz;
  const dir = coneDirection(centralDir, halfAngle, azimuth);

  const speedJitter = hashToSigned(doc.seed, layerKey, shotIndex, bulletIndex, RandomSalt.SPEED) * bullet.speedJitter;
  const speed = bullet.speed * (1 + speedJitter);

  return { shotIndex, bulletIndex, age, dir, speed, accel: bullet.acceleration };
}

function animEnvelope(
  age: number,
  lifetime: number,
  spawnFrac: number,
  despawnFrac: number,
  mode: EffectLayer['bullet']['spawnAnim'],
): { opacity: number; scale: number } {
  let opacity = 1;
  let scale = 1;
  if (mode === 'none') return { opacity, scale };

  const spawnDur = lifetime * clamp(spawnFrac, 0, 0.5);
  const despawnDur = lifetime * clamp(despawnFrac, 0, 0.5);

  if (spawnDur > 0 && age < spawnDur) {
    const f = clamp(age / spawnDur, 0, 1);
    if (mode === 'fade' || mode === 'fadeScale') opacity *= f;
    if (mode === 'scale' || mode === 'fadeScale') scale *= f;
  }
  if (despawnDur > 0 && age > lifetime - despawnDur) {
    const f = clamp((lifetime - age) / despawnDur, 0, 1);
    if (mode === 'fade' || mode === 'fadeScale') opacity *= f;
    if (mode === 'scale' || mode === 'fadeScale') scale *= f;
  }
  return { opacity, scale };
}

function computeLayerFrame(doc: EffectDocument, layer: EffectLayer, time: number): {
  bullets: BulletState[];
  trails: BulletTrail[];
  flashShotTimes: number[];
} {
  const bullets: BulletState[] = [];
  const trails: BulletTrail[] = [];
  const flashShotTimes: number[] = [];
  if (!layer.visible) return { bullets, trails, flashShotTimes };

  const localT = time - layer.startDelaySec;
  const { emitter, bullet } = layer;
  const [sMin, sMax] = shotIndexRange(localT, emitter.interval, bullet.lifetime, emitter.emissionDuration);
  if (sMax < sMin) return { bullets, trails, flashShotTimes };

  const layerKey = stringHash(layer.id);
  const count = Math.max(1, Math.floor(emitter.count));

  for (let s = sMin; s <= sMax; s++) {
    const shotTime = layer.startDelaySec + s * emitter.interval;
    const age = time - shotTime;
    if (age < 0 || age > bullet.lifetime) continue;
    flashShotTimes.push(age);

    for (let b = 0; b < count; b++) {
      const resolved = resolveBullet(doc, layer, layerKey, s, b, age);
      const position = kinematicPosition(emitter.position, resolved.dir, resolved.speed, resolved.accel, age);
      const color = lerpColor(bullet.color, bullet.colorEnd, clamp(age / bullet.lifetime, 0, 1));
      const { opacity, scale } = animEnvelope(age, bullet.lifetime, bullet.spawnAnimFrac, bullet.despawnAnimFrac, bullet.spawnAnim);

      bullets.push({
        layerId: layer.id,
        shotIndex: s,
        bulletIndex: b,
        age,
        lifetime: bullet.lifetime,
        position,
        direction: resolved.dir,
        color,
        opacity,
        scale,
        glowIntensity: bullet.glowIntensity,
      });

      if (bullet.trail === 'line' && bullet.trailDurationSec > 0) {
        const points: TrailSample[] = [];
        const span = Math.min(age, bullet.trailDurationSec);
        for (let i = 0; i < TRAIL_SAMPLES; i++) {
          const f = i / (TRAIL_SAMPLES - 1); // 0 (oldest) .. 1 (head)
          const sampleAge = age - span * (1 - f);
          const pos = kinematicPosition(emitter.position, resolved.dir, resolved.speed, resolved.accel, sampleAge);
          points.push({ position: pos, t: f });
        }
        trails.push({ layerId: layer.id, shotIndex: s, bulletIndex: b, color, points });
      }
    }
  }

  return { bullets, trails, flashShotTimes };
}

export function computeFrame(doc: EffectDocument, time: number): EffectFrame {
  const bullets: BulletState[] = [];
  const trails: BulletTrail[] = [];
  const flashes: FlashEvent[] = [];

  for (const layer of doc.layers) {
    const layerFrame = computeLayerFrame(doc, layer, time);
    bullets.push(...layerFrame.bullets);
    trails.push(...layerFrame.trails);

    if (doc.stage.muzzleFlash.enabled) {
      for (const age of layerFrame.flashShotTimes) {
        const duration = doc.stage.muzzleFlash.durationSec;
        if (age <= duration) {
          flashes.push({
            layerId: layer.id,
            shotIndex: -1,
            position: layer.emitter.position,
            progress: duration > 0 ? clamp(age / duration, 0, 1) : 1,
            color: doc.stage.muzzleFlash.color,
            intensity: doc.stage.muzzleFlash.intensity,
            size: doc.stage.muzzleFlash.size,
          });
        }
      }
    }
  }

  return { time, bullets, trails, flashes };
}
