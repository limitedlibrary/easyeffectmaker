import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PRESETS, createDefaultDocument } from '../src/core/presets';
import { computeEffectFrame } from '../src/core/effects/registry';
import { normalizeDocument } from '../src/io/jsonIO';
import type { EffectDocument, EffectFrame } from '../src/core/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GoldenFixture {
  description: string;
  doc: EffectDocument;
  samples: { time: number; frame: EffectFrame }[];
}

function loadGolden(name: string): GoldenFixture {
  return JSON.parse(readFileSync(resolve(__dirname, 'golden', name), 'utf-8'));
}

/** Recursively compares two values, tolerating tiny floating-point differences, and appends a message per mismatch found. */
function almostEqual(a: unknown, b: unknown, tol: number, path: string, errors: string[]): void {
  if (typeof a === 'number' && typeof b === 'number') {
    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    if (Math.abs(a - b) > tol * scale) errors.push(`${path}: ${a} != ${b}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      errors.push(`${path}: length ${a.length} != ${b.length}`);
      return;
    }
    for (let i = 0; i < a.length; i++) almostEqual(a[i], b[i], tol, `${path}[${i}]`, errors);
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const key of keys) almostEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], tol, `${path}.${key}`, errors);
    return;
  }
  if (a !== b) errors.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}

const GOLDEN_FILES = ['radial.json', 'spiral.json', 'double-rotation.json', 'wave.json', 'multi-layer-3d.json', 'rotation-sanity.json'];

describe('determinism: same doc + same time always yields an identical frame', () => {
  for (const preset of PRESETS) {
    it(preset.id, () => {
      const doc = preset.build();
      const f1 = computeEffectFrame(doc, 2.345);
      const f2 = computeEffectFrame(doc, 2.345);
      expect(f1).toEqual(f2);
    });
  }
});

describe('rotation regression: bullets from different shots must point in different directions', () => {
  // This is a regression guard for a bug where rotationAxis parallel to
  // direction (the default, common configuration) silently produced zero
  // rotation, because the old implementation rotated the pole vector
  // (direction) around itself before cone placement instead of spinning the
  // already-placed bullet direction. See docs/json-spec.md 5.3.1.
  for (const preset of PRESETS) {
    it(preset.id, () => {
      const doc = preset.build();
      const layer = doc.layers[0];
      if (layer.emitter.rotationSpeedDeg === 0 || layer.emitter.spreadAngleDeg === 0) return; // nothing to assert

      const t = layer.bullet.lifetime * 0.9; // late enough that several shots are alive together
      const frame = computeEffectFrame(doc, t);
      const bullets = frame.bullets
        .filter((b) => b.layerId === layer.id && b.bulletIndex === 0)
        .sort((a, b) => a.shotIndex - b.shotIndex);
      expect(bullets.length).toBeGreaterThan(1);

      const first = bullets[0];
      const last = bullets[bullets.length - 1];
      const dot =
        first.direction[0] * last.direction[0] + first.direction[1] * last.direction[1] + first.direction[2] * last.direction[2];
      const angleDeg = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
      expect(angleDeg).toBeGreaterThan(0.01);
    });
  }
});

describe('rotation-sanity hand-verified direction table (docs/json-spec.md 6.2)', () => {
  it('matches the hand-computed values at t=4s', () => {
    const fixture = loadGolden('rotation-sanity.json');
    const sample = fixture.samples.find((s) => s.time === 4);
    expect(sample).toBeDefined();

    const byShot = new Map(sample!.frame.bullets.map((b) => [b.shotIndex, b]));
    const expected: Record<number, [number, number, number]> = {
      0: [0, 0.8660254, 0.5],
      1: [0.5, 0.8660254, 0],
      2: [0, 0.8660254, -0.5],
      3: [-0.5, 0.8660254, 0],
      4: [0, 0.8660254, 0.5], // full period: rotationSpeedDeg(90) * interval(1) * 4 shots = 360deg
    };
    for (const [shotStr, dir] of Object.entries(expected)) {
      const bullet = byShot.get(Number(shotStr));
      expect(bullet, `shot ${shotStr} should be alive at t=4`).toBeDefined();
      for (let i = 0; i < 3; i++) {
        expect(bullet!.direction[i]).toBeCloseTo(dir[i], 3);
      }
    }
  });
});

/**
 * Fixtures are generated with numbers rounded to 6 decimals and each trail
 * trimmed to its first/last point only, to keep fixture files small (see
 * web/scripts/genGolden.ts). Apply the same trim to the freshly computed
 * frame before comparing, and use a tolerance well above the ~5e-7 rounding
 * error but far below any real regression (the rotation bug this guards
 * against produced direction differences on the order of 0.1-0.5).
 */
function trimTrailsForComparison(frame: EffectFrame): EffectFrame {
  return {
    ...frame,
    trails: frame.trails.map((trail) => ({
      ...trail,
      points: trail.points.length <= 2 ? trail.points : [trail.points[0], trail.points[trail.points.length - 1]],
    })),
  };
}

describe('golden fixtures: recomputing from the saved doc reproduces the saved frames', () => {
  for (const file of GOLDEN_FILES) {
    it(file, () => {
      const fixture = loadGolden(file);
      for (const sample of fixture.samples) {
        const recomputed = trimTrailsForComparison(computeEffectFrame(fixture.doc, sample.time));
        const errors: string[] = [];
        almostEqual(recomputed, sample.frame, 1e-5, `t=${sample.time}`, errors);
        expect(errors.join('\n')).toBe('');
      }
    });
  }
});

describe('JSON import validation', () => {
  it('round-trips a well-formed preset document without warnings', () => {
    const fallback = createDefaultDocument();
    const doc = PRESETS[2].build(); // double rotation: 2 layers, exercises more of the schema
    const roundTripped = JSON.parse(JSON.stringify(doc));
    const { ok, errors } = normalizeDocument(roundTripped, fallback);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('clamps out-of-range numbers, rejects bad enums/vectors/colors, and dedupes layer ids', () => {
    const fallback = createDefaultDocument();
    const makeLayerRaw = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      name: id,
      visible: true,
      startDelaySec: 0,
      emitter: {
        count: -5,
        interval: -1,
        direction: [0, 1, 0],
        spreadAngleDeg: 10,
        rotationAxis: [0, 1, 0],
        rotationSpeedDeg: 10,
        waveAmplitudeDeg: 0,
        waveFrequencyHz: 0,
        waveAxis: [0, 1, 0],
        position: [0, 0, 0],
        emissionDuration: 5,
        azimuthJitterDeg: 0,
        spreadJitterDeg: 0,
      },
      bullet: {
        shape: 'not-a-shape',
        size: 0.1,
        color: '#ffffff',
        colorEnd: '#ffffff',
        speed: 1,
        speedJitter: 0,
        acceleration: 0,
        lifetime: 1,
        glowIntensity: 1,
        trail: 'maybe',
        trailDurationSec: 0,
        spawnAnim: 'explode',
        spawnAnimFrac: 0.9,
        despawnAnimFrac: 0.9,
      },
      ...overrides,
    });

    const bad = {
      schemaVersion: '1.0.0',
      effectType: 'rotating_barrage',
      name: 'テスト',
      durationSec: 999999,
      frameRate: -5,
      seed: 9e999, // overflows to Infinity via a valid JSON exponent
      loop: true,
      stage: {
        backgroundColor: 'not-a-color',
        bloom: { enabled: true, strength: -10, radius: 50, threshold: 2 },
        muzzleFlash: { enabled: true, color: '#fff', intensity: 1, durationSec: 0.1, size: 1 },
      },
      camera: {
        position: [0, 0], // wrong length
        target: [0, 0, 0],
        fovDeg: 1000,
        orbitSpeedDeg: 0,
        orbitAxis: [0, 0, 0], // zero vector
      },
      layers: [
        makeLayerRaw('dup'),
        makeLayerRaw('dup', {
          bullet: {
            shape: 'sphere',
            size: 0.1,
            color: '#ffffff',
            colorEnd: '#ffffff',
            speed: 1,
            speedJitter: 0,
            acceleration: 0,
            lifetime: 1,
            glowIntensity: 1,
            trail: 'none',
            trailDurationSec: 0,
            spawnAnim: 'none',
            spawnAnimFrac: 0,
            despawnAnimFrac: 0,
          },
        }),
      ],
    };

    const { ok, errors, doc } = normalizeDocument(bad, fallback);

    expect(ok).toBe(false);
    expect(errors.length).toBeGreaterThan(5);

    expect(doc.durationSec).toBeLessThanOrEqual(60);
    expect(doc.frameRate).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(doc.seed)).toBe(true);

    expect(doc.stage.backgroundColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(doc.stage.bloom.strength).toBeGreaterThanOrEqual(0);
    expect(doc.stage.bloom.radius).toBeLessThanOrEqual(1);
    expect(doc.stage.bloom.threshold).toBeLessThanOrEqual(1);

    expect(doc.camera.position).toEqual([0, 0, 0]);
    expect(doc.camera.fovDeg).toBeLessThanOrEqual(150);

    expect(doc.layers).toHaveLength(2);
    expect(doc.layers[0].id).not.toBe(doc.layers[1].id);

    expect(doc.layers[0].emitter.count).toBeGreaterThanOrEqual(1);
    expect(doc.layers[0].emitter.interval).toBeGreaterThan(0);
    expect(doc.layers[0].bullet.shape).toBe('sphere');
    expect(doc.layers[0].bullet.trail).toBe('none');
    expect(doc.layers[0].bullet.spawnAnim).toBe('none');

    // The sanitized document must still be safe to simulate (no NaN/Infinity leaking through).
    const frame = computeEffectFrame(doc, 1);
    for (const bullet of frame.bullets) {
      for (const v of bullet.position) expect(Number.isFinite(v)).toBe(true);
      for (const v of bullet.direction) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('falls back to the default document for non-object input', () => {
    const fallback = createDefaultDocument();
    const { ok, errors, doc } = normalizeDocument('not an object', fallback);
    expect(ok).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
    expect(doc).toBe(fallback);
  });
});
