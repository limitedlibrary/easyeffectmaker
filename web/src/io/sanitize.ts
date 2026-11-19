import type { EffectDocument, Vec3 } from '../core/types';
import { BULLET_SHAPES, LIMITS, SPAWN_ANIMS, TRAIL_MODES, type Range } from '../core/limits';
import { nextLayerId } from '../core/presets';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function clampNumber(value: number, [min, max]: Range, label: string, warnings: string[]): number {
  if (!Number.isFinite(value)) {
    warnings.push(`${label} が数値ではないため ${min} に調整しました。`);
    return min;
  }
  if (value < min || value > max) {
    const clamped = Math.min(max, Math.max(min, value));
    warnings.push(`${label} の値 ${value} は範囲 [${min}, ${max}] 外のため ${clamped} に調整しました。`);
    return clamped;
  }
  return value;
}

function sanitizeEnumValue<T extends string>(value: T, allowed: readonly T[], fallback: T, label: string, warnings: string[]): T {
  if (allowed.includes(value)) return value;
  warnings.push(`${label} の値 "${value}" は未対応のため既定値 "${fallback}" を使用します。`);
  return fallback;
}

function sanitizeVec3(value: Vec3, label: string, warnings: string[]): Vec3 {
  const isValid = Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number' && Number.isFinite(v));
  if (!isValid) {
    warnings.push(`${label} は3要素の数値ベクトルである必要があるため [0, 0, 0] に調整しました。`);
    return [0, 0, 0];
  }
  return value;
}

function warnIfNearZero(value: Vec3, label: string, warnings: string[]): void {
  const lenSq = value[0] * value[0] + value[1] * value[1] + value[2] * value[2];
  if (lenSq < 1e-12) {
    warnings.push(`${label} がゼロベクトルです。計算時はフォールバック軸 [0, 0, 1] として扱われます。`);
  }
}

function sanitizeColor(value: string, fallback: string, label: string, warnings: string[]): string {
  if (typeof value === 'string' && HEX_COLOR_RE.test(value)) return value;
  warnings.push(`${label} の値 "${value}" は "#rrggbb" 形式のカラーコードではないため既定値 "${fallback}" を使用します。`);
  return fallback;
}

/**
 * Walks an already structurally-merged EffectDocument (every field present
 * with the right JS type, courtesy of mergeDefaults in jsonIO.ts) and
 * clamps every number to its valid range, checks every enum, vector and
 * color, and de-duplicates layer ids. Mutates `doc` in place and appends a
 * human-readable (Japanese) message to `warnings` for every value it had to
 * adjust, so the user always knows when an imported file didn't load
 * exactly as saved.
 */
export function sanitizeDocument(doc: EffectDocument, warnings: string[]): void {
  doc.durationSec = clampNumber(doc.durationSec, LIMITS.doc.durationSec, '再生時間(durationSec)', warnings);
  doc.frameRate = Math.round(clampNumber(doc.frameRate, LIMITS.doc.frameRate, 'フレームレート(frameRate)', warnings));
  if (!Number.isFinite(doc.seed)) {
    warnings.push('乱数シード(seed)が数値ではないため 0 を使用します。');
    doc.seed = 0;
  } else {
    doc.seed = Math.trunc(doc.seed) | 0;
  }

  doc.stage.backgroundColor = sanitizeColor(doc.stage.backgroundColor, '#05060d', '背景色', warnings);
  doc.stage.bloom.strength = clampNumber(doc.stage.bloom.strength, LIMITS.stage.bloomStrength, 'Bloomの強さ', warnings);
  doc.stage.bloom.radius = clampNumber(doc.stage.bloom.radius, LIMITS.stage.bloomRadius, 'Bloomの範囲', warnings);
  doc.stage.bloom.threshold = clampNumber(doc.stage.bloom.threshold, LIMITS.stage.bloomThreshold, 'Bloomのしきい値', warnings);
  doc.stage.muzzleFlash.color = sanitizeColor(doc.stage.muzzleFlash.color, '#ffffff', '発射時の光の色', warnings);
  doc.stage.muzzleFlash.intensity = clampNumber(doc.stage.muzzleFlash.intensity, LIMITS.stage.muzzleIntensity, '発射時の光の強さ', warnings);
  doc.stage.muzzleFlash.durationSec = clampNumber(
    doc.stage.muzzleFlash.durationSec,
    LIMITS.stage.muzzleDurationSec,
    '発射時の光の持続時間',
    warnings,
  );
  doc.stage.muzzleFlash.size = clampNumber(doc.stage.muzzleFlash.size, LIMITS.stage.muzzleSize, '発射時の光の大きさ', warnings);

  doc.camera.position = sanitizeVec3(doc.camera.position, 'カメラ位置', warnings);
  doc.camera.target = sanitizeVec3(doc.camera.target, 'カメラ注視点', warnings);
  doc.camera.fovDeg = clampNumber(doc.camera.fovDeg, LIMITS.camera.fovDeg, 'カメラ視野角', warnings);
  doc.camera.orbitSpeedDeg = clampNumber(doc.camera.orbitSpeedDeg, LIMITS.camera.orbitSpeedDeg, 'カメラの回転速度', warnings);
  doc.camera.orbitAxis = sanitizeVec3(doc.camera.orbitAxis, 'カメラの回転軸', warnings);
  warnIfNearZero(doc.camera.orbitAxis, 'カメラの回転軸', warnings);

  const seenIds = new Set<string>();
  for (const layer of doc.layers) {
    const label = `レイヤー「${layer.name}」`;

    if (typeof layer.id !== 'string' || layer.id.length === 0) {
      warnings.push(`${label} の id が空のため新しいIDを割り当てました。`);
      layer.id = nextLayerId();
    }
    if (seenIds.has(layer.id)) {
      const oldId = layer.id;
      layer.id = nextLayerId();
      warnings.push(
        `${label} の id "${oldId}" が他のレイヤーと重複していたため "${layer.id}" に変更しました（乱数の出方が変わります）。`,
      );
    }
    seenIds.add(layer.id);

    layer.startDelaySec = clampNumber(layer.startDelaySec, LIMITS.layer.startDelaySec, `${label} の開始遅延`, warnings);

    const { emitter, bullet } = layer;

    emitter.count = Math.round(clampNumber(emitter.count, LIMITS.emitter.count, `${label} の同時発射数`, warnings));
    emitter.interval = clampNumber(emitter.interval, LIMITS.emitter.interval, `${label} の発射間隔`, warnings);
    emitter.direction = sanitizeVec3(emitter.direction, `${label} の発射方向`, warnings);
    warnIfNearZero(emitter.direction, `${label} の発射方向`, warnings);
    emitter.spreadAngleDeg = clampNumber(emitter.spreadAngleDeg, LIMITS.emitter.spreadAngleDeg, `${label} の拡散角度`, warnings);
    emitter.rotationAxis = sanitizeVec3(emitter.rotationAxis, `${label} の回転軸`, warnings);
    warnIfNearZero(emitter.rotationAxis, `${label} の回転軸`, warnings);
    emitter.rotationSpeedDeg = clampNumber(
      emitter.rotationSpeedDeg,
      LIMITS.emitter.rotationSpeedDeg,
      `${label} の発射方向の回転速度`,
      warnings,
    );
    emitter.waveAmplitudeDeg = clampNumber(emitter.waveAmplitudeDeg, LIMITS.emitter.waveAmplitudeDeg, `${label} の波の振幅`, warnings);
    emitter.waveFrequencyHz = clampNumber(emitter.waveFrequencyHz, LIMITS.emitter.waveFrequencyHz, `${label} の波の周波数`, warnings);
    emitter.waveAxis = sanitizeVec3(emitter.waveAxis, `${label} の波の回転軸`, warnings);
    warnIfNearZero(emitter.waveAxis, `${label} の波の回転軸`, warnings);
    emitter.position = sanitizeVec3(emitter.position, `${label} の発射位置`, warnings);
    emitter.emissionDuration = clampNumber(
      emitter.emissionDuration,
      LIMITS.emitter.emissionDuration,
      `${label} の発射継続時間`,
      warnings,
    );
    emitter.azimuthJitterDeg = clampNumber(
      emitter.azimuthJitterDeg,
      LIMITS.emitter.azimuthJitterDeg,
      `${label} の方向のばらつき`,
      warnings,
    );
    emitter.spreadJitterDeg = clampNumber(
      emitter.spreadJitterDeg,
      LIMITS.emitter.spreadJitterDeg,
      `${label} の拡散のばらつき`,
      warnings,
    );

    bullet.shape = sanitizeEnumValue(bullet.shape, BULLET_SHAPES, 'sphere', `${label} の弾の形状`, warnings);
    bullet.size = clampNumber(bullet.size, LIMITS.bullet.size, `${label} の弾の大きさ`, warnings);
    bullet.color = sanitizeColor(bullet.color, '#7fe0ff', `${label} の弾の色（開始）`, warnings);
    bullet.colorEnd = sanitizeColor(bullet.colorEnd, '#2a5bff', `${label} の弾の色（終了）`, warnings);
    bullet.speed = clampNumber(bullet.speed, LIMITS.bullet.speed, `${label} の移動速度`, warnings);
    bullet.speedJitter = clampNumber(bullet.speedJitter, LIMITS.bullet.speedJitter, `${label} の速度のばらつき`, warnings);
    bullet.acceleration = clampNumber(bullet.acceleration, LIMITS.bullet.acceleration, `${label} の加速度`, warnings);
    bullet.lifetime = clampNumber(bullet.lifetime, LIMITS.bullet.lifetime, `${label} の寿命`, warnings);
    bullet.glowIntensity = clampNumber(bullet.glowIntensity, LIMITS.bullet.glowIntensity, `${label} の発光強度`, warnings);
    bullet.trail = sanitizeEnumValue(bullet.trail, TRAIL_MODES, 'none', `${label} の軌跡の有無`, warnings);
    bullet.trailDurationSec = clampNumber(
      bullet.trailDurationSec,
      LIMITS.bullet.trailDurationSec,
      `${label} の軌跡の長さ`,
      warnings,
    );
    bullet.spawnAnim = sanitizeEnumValue(bullet.spawnAnim, SPAWN_ANIMS, 'none', `${label} の出現・消滅演出`, warnings);
    bullet.spawnAnimFrac = clampNumber(bullet.spawnAnimFrac, LIMITS.bullet.spawnAnimFrac, `${label} の出現時間の割合`, warnings);
    bullet.despawnAnimFrac = clampNumber(
      bullet.despawnAnimFrac,
      LIMITS.bullet.despawnAnimFrac,
      `${label} の消滅時間の割合`,
      warnings,
    );
  }
}
