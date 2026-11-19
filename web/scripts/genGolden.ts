/**
 * Generates golden test fixtures under web/test/golden/*.json. Each fixture
 * is self-contained: a full EffectDocument plus the exact EffectFrame the
 * simulation produces at a handful of sample times. These serve two
 * purposes:
 *   1. Regression testing (web/test/simulation.test.ts re-computes each
 *      frame from `doc` and diffs it against `samples`).
 *   2. Ground-truth data for a future Blender Python port: feed the same
 *      `doc` + `time` into the Python implementation and the resulting
 *      per-bullet position/direction/color/scale should match `samples`.
 *
 * Run with: npm run gen:golden
 * Re-run and commit the diff whenever the simulation algorithm changes
 * intentionally (docs/json-spec.md section 5 must be updated to match).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS, makeDocument, makeLayer } from '../src/core/presets';
import { computeEffectFrame } from '../src/core/effects/registry';
import type { EffectDocument, EffectFrame } from '../src/core/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../test/golden');
mkdirSync(outDir, { recursive: true });

/**
 * Rounds every number in a frame to 6 decimal places before it's written to
 * disk. The computed frame carries full double precision, which turns these
 * fixtures into multi-megabyte files for no real benefit -- 6 decimals is
 * already far finer than anything visually or numerically meaningful here.
 * The test suite compares against these rounded values with a matching
 * tolerance (see web/test/simulation.test.ts).
 */
function roundNumbers<T>(value: T): T {
  if (typeof value === 'number') return (Number.isFinite(value) ? Number(value.toFixed(6)) : value) as unknown as T;
  if (Array.isArray(value)) return value.map(roundNumbers) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = roundNumbers(v);
    return out as T;
  }
  return value;
}

/**
 * Trails are an 8-point polyline per bullet sampled from the exact same
 * `kinematicPosition` formula already exercised (and compared) via
 * `bullets`, so keeping all 8 points in every fixture is mostly redundant
 * data weight. Keeping just the oldest and newest point still exercises the
 * trail-sampling code path (web/src/core/effects/rotatingBarrage.ts
 * `computeLayerFrame`'s trail loop, section 5.4 of the spec) end to end
 * while cutting fixture size roughly 4x.
 */
function trimTrails(frame: EffectFrame): EffectFrame {
  return {
    ...frame,
    trails: frame.trails.map((trail) => ({
      ...trail,
      points: trail.points.length <= 2 ? trail.points : [trail.points[0], trail.points[trail.points.length - 1]],
    })),
  };
}

function writeFixture(fileName: string, description: string, doc: EffectDocument, times: number[]): void {
  const samples = times.map((time) => ({ time, frame: roundNumbers(trimTrails(computeEffectFrame(doc, time))) }));
  const fixture = { description, doc, samples };
  writeFileSync(resolve(outDir, fileName), JSON.stringify(fixture, null, 2) + '\n', 'utf-8');
  console.log('wrote', fileName, `(${samples.reduce((n, s) => n + s.frame.bullets.length, 0)} bullets total across samples)`);
}

const presetFileNames: Record<string, string> = {
  radial: 'radial.json',
  spiral: 'spiral.json',
  double: 'double-rotation.json',
  wave: 'wave.json',
  multilayer: 'multi-layer-3d.json',
};

for (const preset of PRESETS) {
  const doc = preset.build();
  const times = [0.5, 1.37, doc.durationSec * 0.8];
  writeFixture(presetFileNames[preset.id] ?? `${preset.id}.json`, `Preset: ${preset.label}`, doc, times);
}

// A deliberately minimal, hand-verifiable case: a single bullet per shot, no
// jitter, rotationAxis exactly equal to direction (the configuration that
// was silently non-rotating before the rotation-axis fix). The expected
// direction vectors at s=0,1,2 are worked out by hand in
// docs/json-spec.md section 6.2 -- useful for a Blender-side implementer to
// sanity check their port against, independent of this fixture file.
const rotationSanityLayer = makeLayer(
  '回転サニティチェック',
  {
    count: 1,
    interval: 1.0,
    direction: [0, 1, 0],
    spreadAngleDeg: 60, // half-angle 30 deg
    rotationAxis: [0, 1, 0], // == direction: the previously-broken case
    rotationSpeedDeg: 90,
    waveAmplitudeDeg: 0,
    waveFrequencyHz: 0,
    waveAxis: [1, 0, 0],
    position: [0, 0, 0],
    emissionDuration: 10,
    azimuthJitterDeg: 0,
    spreadJitterDeg: 0,
  },
  {
    shape: 'sphere',
    size: 0.1,
    color: '#ffffff',
    colorEnd: '#ffffff',
    speed: 1,
    speedJitter: 0,
    acceleration: 0,
    lifetime: 10,
    glowIntensity: 1,
    trail: 'line',
    trailDurationSec: 2,
    spawnAnim: 'none',
    spawnAnimFrac: 0,
    despawnAnimFrac: 0,
  },
);
const rotationSanityDoc = makeDocument('回転サニティチェック', [rotationSanityLayer], {
  seed: 0,
  durationSec: 10,
  frameRate: 30,
  loop: false,
});
writeFixture(
  'rotation-sanity.json',
  'Hand-verifiable single-bullet-per-shot rotation case with rotationAxis == direction; see docs/json-spec.md 6.2',
  rotationSanityDoc,
  [0, 1, 2, 3, 4],
);
