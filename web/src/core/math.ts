import type { Vec3 } from './types';

/**
 * Minimal, renderer-agnostic vector math. Kept deliberately tiny and
 * explicit (rather than pulling in three.js's Vector3) so this file can be
 * transcribed to Python almost line-for-line. See docs/json-spec.md for the
 * exact formulas these functions implement.
 */

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len < 1e-9) return [0, 0, 1];
  return scale(a, 1 / len);
}

export function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Rotate vector `v` around unit axis `axis` by `angleDeg` degrees, using the
 * Rodrigues rotation formula. `axis` does not need to be pre-normalized.
 */
export function rotateAroundAxis(v: Vec3, axis: Vec3, angleDeg: number): Vec3 {
  const k = normalize(axis);
  const theta = deg2rad(angleDeg);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const kv = cross(k, v);
  const kDotV = dot(k, v);
  return [
    v[0] * cosT + kv[0] * sinT + k[0] * kDotV * (1 - cosT),
    v[1] * cosT + kv[1] * sinT + k[1] * kDotV * (1 - cosT),
    v[2] * cosT + kv[2] * sinT + k[2] * kDotV * (1 - cosT),
  ];
}

/**
 * Build a point on a cone around unit direction `dir`: `halfAngleDeg` away
 * from `dir`, at azimuth `azimuthDeg` around it. Used to place each bullet
 * of a ring on the emission cone.
 *
 * The cone's local "up" reference is world +Y, unless `dir` is nearly
 * parallel to +Y, in which case world +X is used instead. This exact
 * fallback rule must be reproduced in Blender-side code; see
 * docs/json-spec.md.
 */
export function coneDirection(dir: Vec3, halfAngleDeg: number, azimuthDeg: number): Vec3 {
  const d = normalize(dir);
  const worldUp: Vec3 = [0, 1, 0];
  const referenceUp: Vec3 = Math.abs(dot(d, worldUp)) > 0.999 ? [1, 0, 0] : worldUp;
  const u = normalize(cross(referenceUp, d));
  const v = cross(d, u); // already unit length since d, u are orthonormal

  const half = deg2rad(halfAngleDeg);
  const az = deg2rad(azimuthDeg);
  const cosHalf = Math.cos(half);
  const sinHalf = Math.sin(half);

  const radial = add(scale(u, Math.cos(az)), scale(v, Math.sin(az)));
  return normalize(add(scale(d, cosHalf), scale(radial, sinHalf)));
}

/**
 * Kinematic position under constant acceleration along a fixed direction:
 * pos(age) = origin + dir * (speed * age + 0.5 * accel * age^2)
 */
export function kinematicPosition(
  origin: Vec3,
  dir: Vec3,
  speed: number,
  accel: number,
  age: number,
): Vec3 {
  const dist = speed * age + 0.5 * accel * age * age;
  return add(origin, scale(dir, dist));
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) =>
    Math.round(clamp(c, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function lerpColor(hexA: string, hexB: string, t: number): string {
  const [ra, ga, ba] = hexToRgb(hexA);
  const [rb, gb, bb] = hexToRgb(hexB);
  return rgbToHex(lerp(ra, rb, t), lerp(ga, gb, t), lerp(ba, bb, t));
}
