/**
 * Deterministic, stateless pseudo-random number source.
 *
 * Every call is a pure function of (seed, a, b, c, salt) -> [0, 1). There is
 * no sequential state, so re-evaluating the effect at an arbitrary time `t`
 * (timeline scrubbing, Blender re-implementation) always yields exactly the
 * same jitter values for the same bullet, regardless of evaluation order.
 *
 * This exact bit-manipulation (32-bit integer hashing, Math.imul-equivalent
 * multiplications) is documented in docs/json-spec.md so the same function
 * can be reproduced with numpy uint32 arithmetic in Python.
 */

const MAGIC_SEED_XOR = 0x9e3779b9;
const MUL_A = 0x85ebca6b;
const MUL_B = 0xc2b2ae35;
const MUL_C = 0x27d4eb2f;

function imul32(a: number, b: number): number {
  // Same semantics as Math.imul: 32-bit integer multiply, wrap on overflow.
  const aHi = (a >>> 16) & 0xffff;
  const aLo = a & 0xffff;
  const result = (((aHi * b) << 16) + aLo * b) | 0;
  return result;
}

/** Hash four integers + a seed into a float in [0, 1). */
export function hashToUnit(seed: number, a: number, b: number, c: number, salt: number): number {
  let h = (seed ^ MAGIC_SEED_XOR) | 0;
  h = imul32(h ^ a, MUL_A);
  h = imul32(h ^ b, MUL_B);
  h = imul32(h ^ c, MUL_C);
  h = imul32(h ^ salt, MUL_A ^ MUL_C);
  h ^= h >>> 15;
  h = h >>> 0;
  return h / 4294967296;
}

/** Hash into [-1, 1). */
export function hashToSigned(seed: number, a: number, b: number, c: number, salt: number): number {
  return hashToUnit(seed, a, b, c, salt) * 2 - 1;
}

/** Salts used to pull independent-looking random streams out of the same (seed, shot, bullet) key. */
export const RandomSalt = {
  AZIMUTH: 1,
  SPREAD: 2,
  SPEED: 3,
} as const;
