import type {
  BulletConfig,
  EffectDocument,
  EffectLayer,
  EmitterConfig,
  Vec3,
} from './types';

export const SCHEMA_VERSION = '1.0.0';

function defaultEmitter(overrides: Partial<EmitterConfig> = {}): EmitterConfig {
  return {
    count: 8,
    interval: 0.15,
    direction: [0, 1, 0],
    spreadAngleDeg: 60,
    rotationAxis: [0, 1, 0],
    rotationSpeedDeg: 40,
    waveAmplitudeDeg: 0,
    waveFrequencyHz: 0.5,
    waveAxis: [1, 0, 0],
    position: [0, 0, 0],
    emissionDuration: 6,
    azimuthJitterDeg: 2,
    spreadJitterDeg: 2,
    ...overrides,
  };
}

function defaultBullet(overrides: Partial<BulletConfig> = {}): BulletConfig {
  return {
    shape: 'sphere',
    size: 0.12,
    color: '#7fe0ff',
    colorEnd: '#2a5bff',
    speed: 4,
    speedJitter: 0.05,
    acceleration: -0.15,
    lifetime: 3.2,
    glowIntensity: 1.6,
    trail: 'line',
    trailDurationSec: 0.35,
    spawnAnim: 'fadeScale',
    spawnAnimFrac: 0.12,
    despawnAnimFrac: 0.3,
    ...overrides,
  };
}

let layerCounter = 0;
export function nextLayerId(): string {
  layerCounter += 1;
  return `layer-${layerCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makeLayer(
  name: string,
  emitterOverrides: Partial<EmitterConfig> = {},
  bulletOverrides: Partial<BulletConfig> = {},
  layerOverrides: Partial<Pick<EffectLayer, 'startDelaySec' | 'visible'>> = {},
): EffectLayer {
  return {
    id: nextLayerId(),
    name,
    visible: true,
    startDelaySec: 0,
    emitter: defaultEmitter(emitterOverrides),
    bullet: defaultBullet(bulletOverrides),
    ...layerOverrides,
  };
}

export function makeDocument(name: string, layers: EffectLayer[], overrides: Partial<EffectDocument> = {}): EffectDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    effectType: 'rotating_barrage',
    name,
    durationSec: 10,
    frameRate: 30,
    seed: 1234,
    loop: true,
    stage: {
      backgroundColor: '#05060d',
      bloom: { enabled: true, strength: 1.15, radius: 0.55, threshold: 0.12 },
      muzzleFlash: { enabled: true, color: '#ffffff', intensity: 2, durationSec: 0.12, size: 0.5 },
    },
    camera: {
      position: [0, 2.5, 9] as Vec3,
      target: [0, 0, 0] as Vec3,
      fovDeg: 50,
      orbitSpeedDeg: 6,
      orbitAxis: [0, 1, 0] as Vec3,
    },
    layers,
    ...overrides,
  };
}

/** 放射状弾幕: a single ring of bullets bursting outward in the equatorial plane, pulsing. */
function presetRadial(): EffectDocument {
  const layer = makeLayer(
    '放射リング',
    {
      count: 28,
      interval: 0.55,
      direction: [0, 1, 0],
      spreadAngleDeg: 180,
      rotationSpeedDeg: 18,
      azimuthJitterDeg: 1,
      spreadJitterDeg: 1,
      emissionDuration: 7,
    },
    {
      color: '#ffd37f',
      colorEnd: '#ff5f6d',
      speed: 4.5,
      acceleration: 0.05,
      lifetime: 3,
      glowIntensity: 1.8,
    },
  );
  return makeDocument('放射状弾幕', [layer], { seed: 11 });
}

/** 螺旋状弾幕: a few continuous arms spiraling outward as the emission direction rotates fast. */
function presetSpiral(): EffectDocument {
  const layer = makeLayer(
    '螺旋アーム',
    {
      count: 3,
      interval: 0.05,
      direction: [0, 1, 0],
      spreadAngleDeg: 46,
      rotationSpeedDeg: 160,
      azimuthJitterDeg: 1.5,
      spreadJitterDeg: 1.5,
      emissionDuration: 8,
    },
    {
      color: '#9fffe0',
      colorEnd: '#3f8dff',
      speed: 3.6,
      acceleration: -0.1,
      lifetime: 3.6,
      trailDurationSec: 0.5,
      glowIntensity: 1.7,
    },
  );
  return makeDocument('螺旋状弾幕', [layer], { seed: 22 });
}

/** 二重回転弾幕: two rings counter-rotating at different speeds and colors. */
function presetDoubleSpiral(): EffectDocument {
  const outer = makeLayer(
    '外側リング（時計回り）',
    {
      count: 4,
      interval: 0.09,
      direction: [0, 1, 0],
      spreadAngleDeg: 70,
      rotationSpeedDeg: 120,
      emissionDuration: 8,
    },
    { color: '#ff9fd6', colorEnd: '#ff3f9e', speed: 3.8, lifetime: 3.4, glowIntensity: 1.6 },
  );
  const inner = makeLayer(
    '内側リング（反時計回り）',
    {
      count: 3,
      interval: 0.1,
      direction: [0, 1, 0],
      spreadAngleDeg: 30,
      rotationSpeedDeg: -150,
      emissionDuration: 8,
    },
    { color: '#9fd6ff', colorEnd: '#3f6fff', speed: 2.6, lifetime: 3.4, glowIntensity: 1.6 },
  );
  return makeDocument('二重回転弾幕', [outer, inner], { seed: 33 });
}

/** 波状弾幕: a wide ring whose central direction undulates up and down like a wave. */
function presetWave(): EffectDocument {
  const layer = makeLayer(
    '波打つリング',
    {
      count: 10,
      interval: 0.12,
      direction: [0, 0, 1],
      spreadAngleDeg: 150,
      rotationSpeedDeg: 10,
      waveAmplitudeDeg: 45,
      waveFrequencyHz: 0.35,
      waveAxis: [1, 0, 0],
      emissionDuration: 8,
    },
    { color: '#bfffb0', colorEnd: '#2fd0a0', speed: 3.4, lifetime: 3.8, glowIntensity: 1.5 },
  );
  return makeDocument('波状弾幕', [layer], { seed: 44 });
}

/** 多層立体弾幕: three layers rotating around different tilted axes for a complex 3D silhouette. */
function presetMultiLayer(): EffectDocument {
  const a = makeLayer(
    '層A（垂直軸）',
    { count: 5, interval: 0.1, direction: [0, 1, 0], spreadAngleDeg: 50, rotationAxis: [0, 1, 0], rotationSpeedDeg: 90, emissionDuration: 8 },
    { color: '#ffe08a', colorEnd: '#ff6f3f', speed: 3.2, lifetime: 3.6, glowIntensity: 1.6 },
  );
  const b = makeLayer(
    '層B（水平軸）',
    { count: 5, interval: 0.1, direction: [1, 0, 0], spreadAngleDeg: 50, rotationAxis: [0, 0, 1], rotationSpeedDeg: -90, emissionDuration: 8 },
    { color: '#8affc9', colorEnd: '#2fb5ff', speed: 3.2, lifetime: 3.6, glowIntensity: 1.6 },
  );
  const c = makeLayer(
    '層C（斜め軸）',
    { count: 4, interval: 0.14, direction: [0, 0, 1], spreadAngleDeg: 40, rotationAxis: [1, 1, 0], rotationSpeedDeg: 70, emissionDuration: 8 },
    { color: '#d6a8ff', colorEnd: '#6a3fff', speed: 2.6, lifetime: 3.8, glowIntensity: 1.6 },
  );
  return makeDocument('多層立体弾幕', [a, b, c], { seed: 55, camera: { position: [0, 3, 11], target: [0, 0, 0], fovDeg: 50, orbitSpeedDeg: 8, orbitAxis: [0, 1, 0] } });
}

export interface PresetDefinition {
  id: string;
  label: string;
  build: () => EffectDocument;
}

export const PRESETS: PresetDefinition[] = [
  { id: 'radial', label: '放射状弾幕', build: presetRadial },
  { id: 'spiral', label: '螺旋状弾幕', build: presetSpiral },
  { id: 'double', label: '二重回転弾幕', build: presetDoubleSpiral },
  { id: 'wave', label: '波状弾幕', build: presetWave },
  { id: 'multilayer', label: '多層立体弾幕', build: presetMultiLayer },
];

export function createDefaultDocument(): EffectDocument {
  return presetRadial();
}
