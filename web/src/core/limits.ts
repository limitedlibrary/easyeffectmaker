import type { BulletShape, SpawnAnim, TrailMode } from './types';

/**
 * Single source of truth for every numeric range and enum this app accepts,
 * shared by the settings panel sliders (web/src/ui/Panel.ts) and JSON import
 * validation (web/src/io/jsonIO.ts). Keeping both pulling from the same
 * table means a value the UI can produce is always accepted on import, and
 * vice versa.
 */
export const LIMITS = {
  doc: {
    durationSec: [0.5, 60] as const,
    frameRate: [1, 240] as const,
  },
  emitter: {
    count: [1, 64] as const,
    interval: [0.01, 5] as const,
    spreadAngleDeg: [0, 360] as const,
    rotationSpeedDeg: [-720, 720] as const,
    waveAmplitudeDeg: [0, 180] as const,
    waveFrequencyHz: [0, 5] as const,
    emissionDuration: [0, 60] as const,
    azimuthJitterDeg: [0, 90] as const,
    spreadJitterDeg: [0, 90] as const,
  },
  bullet: {
    size: [0.01, 5] as const,
    speed: [0, 50] as const,
    speedJitter: [0, 1] as const,
    acceleration: [-50, 50] as const,
    lifetime: [0.05, 30] as const,
    glowIntensity: [0, 10] as const,
    trailDurationSec: [0, 5] as const,
    spawnAnimFrac: [0, 0.5] as const,
    despawnAnimFrac: [0, 0.5] as const,
  },
  layer: {
    startDelaySec: [-60, 60] as const,
  },
  stage: {
    bloomStrength: [0, 5] as const,
    bloomRadius: [0, 1] as const,
    bloomThreshold: [0, 1] as const,
    muzzleIntensity: [0, 10] as const,
    muzzleDurationSec: [0, 3] as const,
    muzzleSize: [0, 5] as const,
  },
  camera: {
    fovDeg: [10, 150] as const,
    orbitSpeedDeg: [-360, 360] as const,
  },
} as const;

export const FRAME_RATE_OPTIONS = [24, 30, 60, 120] as const;
export const BULLET_SHAPES: readonly BulletShape[] = ['sphere', 'box', 'octahedron', 'sprite'];
export const TRAIL_MODES: readonly TrailMode[] = ['none', 'line'];
export const SPAWN_ANIMS: readonly SpawnAnim[] = ['none', 'fade', 'scale', 'fadeScale'];

export type Range = readonly [number, number];
