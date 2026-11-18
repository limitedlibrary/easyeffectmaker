/**
 * Core data model for an effect document.
 *
 * This module is intentionally free of any Three.js (or other renderer)
 * dependency. It describes the *simulation* side of an effect only, so it
 * can be ported 1:1 to a Python/Blender implementation later. See
 * docs/json-spec.md for the authoritative description of every field,
 * the coordinate system, units and the trajectory formulas.
 */

export type Vec3 = [number, number, number];

export type BulletShape = 'sphere' | 'box' | 'octahedron' | 'sprite';
export type TrailMode = 'none' | 'line';
export type SpawnAnim = 'none' | 'fade' | 'scale' | 'fadeScale';

export interface EmitterConfig {
  /** Bullets fired per shot (同時発射数). */
  count: number;
  /** Seconds between shots (発射間隔). */
  interval: number;
  /** Base emission direction, unit-ish vector, will be normalized (発射方向). */
  direction: Vec3;
  /** Full cone spread angle in degrees, 0 = all bullets share one direction (拡散角度). */
  spreadAngleDeg: number;
  /** Axis the emission direction rotates around (normalized), (0,1,0) = world up. */
  rotationAxis: Vec3;
  /** Rotation speed of the emission direction, degrees/second (発射方向の回転速度). */
  rotationSpeedDeg: number;
  /**
   * Extra sinusoidal "wave" tilt applied on top of the steady rotation, to
   * produce undulating / wave-shaped barrages. Amplitude in degrees, 0 disables it.
   */
  waveAmplitudeDeg: number;
  /** Wave oscillation frequency in Hz (cycles/second). */
  waveFrequencyHz: number;
  /** Axis the wave tilt rotates around (normalized), independent of rotationAxis. */
  waveAxis: Vec3;
  /** Emission origin in world space (発射位置). */
  position: Vec3;
  /** How long (seconds) the emitter keeps firing new shots (発射継続時間). */
  emissionDuration: number;
  /** Random jitter applied to each bullet's azimuth within its ring, in degrees. */
  azimuthJitterDeg: number;
  /** Random jitter applied to each bullet's cone half-angle, in degrees. */
  spreadJitterDeg: number;
}

export interface BulletConfig {
  shape: BulletShape;
  /** Radius-equivalent size in scene units. */
  size: number;
  /** Start color, hex string e.g. "#66ccff". */
  color: string;
  /** End color the bullet fades toward over its lifetime; same as color if omitted visually. */
  colorEnd: string;
  /** Initial speed, units/second. */
  speed: number;
  /** Random +/- jitter fraction applied to speed, 0..1. */
  speedJitter: number;
  /** Acceleration along the bullet's own travel direction, units/second^2. */
  acceleration: number;
  /** Lifetime in seconds after spawn. */
  lifetime: number;
  /** Bloom/emissive strength multiplier for this bullet type. */
  glowIntensity: number;
  trail: TrailMode;
  /** Trail length expressed as seconds of travel history. */
  trailDurationSec: number;
  spawnAnim: SpawnAnim;
  /** Fraction of lifetime spent on the spawn-in animation, 0..0.5. */
  spawnAnimFrac: number;
  /** Fraction of lifetime spent on the despawn-out animation, 0..0.5. */
  despawnAnimFrac: number;
}

export interface BloomConfig {
  enabled: boolean;
  strength: number;
  radius: number;
  threshold: number;
}

export interface MuzzleFlashConfig {
  enabled: boolean;
  color: string;
  intensity: number;
  durationSec: number;
  size: number;
}

export interface StageConfig {
  backgroundColor: string;
  bloom: BloomConfig;
  muzzleFlash: MuzzleFlashConfig;
}

export interface CameraConfig {
  position: Vec3;
  target: Vec3;
  fovDeg: number;
  /** Automatic orbit speed of the camera around `target`, degrees/second. 0 = static. */
  orbitSpeedDeg: number;
  /** Axis the camera orbits around (normalized), (0,1,0) = world up. */
  orbitAxis: Vec3;
}

export interface EffectLayer {
  id: string;
  name: string;
  visible: boolean;
  /** Extra time offset (seconds) added before this layer's local clock starts. */
  startDelaySec: number;
  emitter: EmitterConfig;
  bullet: BulletConfig;
}

export type EffectType = 'rotating_barrage';

/** Top-level, serializable document. This is exactly what gets written to / read from JSON. */
export interface EffectDocument {
  /** Schema version for this JSON document, semver string. */
  schemaVersion: string;
  effectType: EffectType;
  /** Human readable name for this save, optional. */
  name: string;
  /** Total playback duration in seconds. */
  durationSec: number;
  /** Reference frame rate used when a frame-indexed reproduction (e.g. Blender) is needed. */
  frameRate: number;
  /** Integer seed driving all pseudo-randomness. Same seed + config => same result. */
  seed: number;
  loop: boolean;
  stage: StageConfig;
  camera: CameraConfig;
  layers: EffectLayer[];
}

/** A single bullet's resolved, renderer-agnostic state at a given time. */
export interface BulletState {
  layerId: string;
  shotIndex: number;
  bulletIndex: number;
  /** Age since spawn, seconds. */
  age: number;
  lifetime: number;
  position: Vec3;
  /** Normalized travel direction, used to orient non-spherical shapes. */
  direction: Vec3;
  color: string;
  /** 0..1 */
  opacity: number;
  /** 0..1 scale multiplier from spawn/despawn animation. */
  scale: number;
  glowIntensity: number;
}

/** A sampled trail point for one bullet, oldest-first. */
export interface TrailSample {
  position: Vec3;
  /** 0 (tail, oldest) .. 1 (head, current). */
  t: number;
}

export interface BulletTrail {
  layerId: string;
  shotIndex: number;
  bulletIndex: number;
  color: string;
  points: TrailSample[];
}

/** A muzzle-flash event currently active at time t. */
export interface FlashEvent {
  layerId: string;
  shotIndex: number;
  position: Vec3;
  /** 0 (just fired) .. 1 (flash finished). */
  progress: number;
  color: string;
  intensity: number;
  size: number;
}

/** Full renderer-agnostic snapshot of the effect at one instant. */
export interface EffectFrame {
  time: number;
  bullets: BulletState[];
  trails: BulletTrail[];
  flashes: FlashEvent[];
}
