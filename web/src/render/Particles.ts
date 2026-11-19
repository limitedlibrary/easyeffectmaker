import * as THREE from 'three';
import type { BulletShape } from '../core/types';
import type { BulletState, BulletTrail, FlashEvent } from '../core/types';

const Z_AXIS = new THREE.Vector3(0, 0, 1);

const SOLID_VERTEX = /* glsl */ `
  attribute vec3 iColor;
  attribute float iAlpha;
  attribute float iGlow;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vGlow;
  varying vec3 vNormal;
  void main() {
    vColor = iColor;
    vAlpha = iAlpha;
    vGlow = iGlow;
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vec4 worldPos = instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * worldPos;
  }
`;

const SOLID_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vGlow;
  varying vec3 vNormal;
  void main() {
    float rim = 0.55 + 0.45 * pow(clamp(1.0 - abs(vNormal.z), 0.0, 1.0), 1.4);
    vec3 outColor = vColor * vGlow * rim;
    gl_FragColor = vec4(outColor, vAlpha);
  }
`;

const BILLBOARD_VERTEX = /* glsl */ `
  attribute vec3 iColor;
  attribute float iAlpha;
  attribute float iGlow;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vGlow;
  varying vec2 vUv;
  void main() {
    vColor = iColor;
    vAlpha = iAlpha;
    vGlow = iGlow;
    vUv = uv;
    vec3 center = instanceMatrix[3].xyz;
    float size = length(instanceMatrix[0].xyz);
    vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
    mvPosition.xy += position.xy * size;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const BILLBOARD_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vGlow;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - vec2(0.5));
    float falloff = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * vGlow, vAlpha * falloff * falloff);
  }
`;

function geometryForShape(shape: BulletShape): THREE.BufferGeometry {
  switch (shape) {
    case 'box':
      return new THREE.BoxGeometry(0.8, 0.8, 1.7);
    case 'octahedron':
      return new THREE.OctahedronGeometry(1, 0);
    case 'sprite':
      return new THREE.PlaneGeometry(1, 1);
    case 'sphere':
    default:
      return new THREE.IcosahedronGeometry(1, 1);
  }
}

const SHAPES: BulletShape[] = ['sphere', 'box', 'octahedron', 'sprite'];

/** How many bullets/trails/flashes the renderer can actually draw per shape/type. */
export const RENDER_CAPACITY = {
  bulletsPerShape: 6000,
  trails: 2500,
  flashes: 128,
} as const;

const MAX_INSTANCES = RENDER_CAPACITY.bulletsPerShape;

/** Simulated-vs-drawn counts for one frame, used to warn the user when the simulation outruns render capacity. */
export interface RenderStats {
  computed: number;
  rendered: number;
}

interface ShapeBucket {
  mesh: THREE.InstancedMesh;
  colorAttr: THREE.InstancedBufferAttribute;
  alphaAttr: THREE.InstancedBufferAttribute;
  glowAttr: THREE.InstancedBufferAttribute;
  dummy: THREE.Object3D;
  cursor: number;
}

/** Instanced-mesh renderer for all bullets across all layers, grouped by shape. */
export class BulletRenderer {
  private buckets: Map<BulletShape, ShapeBucket> = new Map();
  readonly group = new THREE.Group();

  constructor() {
    for (const shape of SHAPES) {
      const geometry = geometryForShape(shape);
      const isBillboard = shape === 'sprite';
      const material = new THREE.ShaderMaterial({
        vertexShader: isBillboard ? BILLBOARD_VERTEX : SOLID_VERTEX,
        fragmentShader: isBillboard ? BILLBOARD_FRAGMENT : SOLID_FRAGMENT,
        transparent: true,
        depthWrite: !isBillboard,
        blending: isBillboard ? THREE.AdditiveBlending : THREE.NormalBlending,
      });

      const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 3), 3);
      const alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1);
      const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1);
      colorAttr.setUsage(THREE.DynamicDrawUsage);
      alphaAttr.setUsage(THREE.DynamicDrawUsage);
      glowAttr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('iColor', colorAttr);
      geometry.setAttribute('iAlpha', alphaAttr);
      geometry.setAttribute('iGlow', glowAttr);

      const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);

      this.buckets.set(shape, { mesh, colorAttr, alphaAttr, glowAttr, dummy: new THREE.Object3D(), cursor: 0 });
    }
  }

  update(bullets: BulletState[], shapeByLayer: Map<string, BulletShape>, sizeByLayer: Map<string, number>): RenderStats {
    for (const bucket of this.buckets.values()) bucket.cursor = 0;

    const color = new THREE.Color();
    let rendered = 0;
    for (const bullet of bullets) {
      const shape = shapeByLayer.get(bullet.layerId) ?? 'sphere';
      const bucket = this.buckets.get(shape)!;
      if (bucket.cursor >= MAX_INSTANCES) continue;
      const i = bucket.cursor++;
      rendered++;

      const size = (sizeByLayer.get(bullet.layerId) ?? 0.1) * bullet.scale;
      bucket.dummy.position.set(...bullet.position);
      if (shape === 'sprite') {
        bucket.dummy.quaternion.identity();
      } else if (shape === 'sphere') {
        bucket.dummy.quaternion.identity();
      } else {
        const dir = new THREE.Vector3(...bullet.direction);
        bucket.dummy.quaternion.setFromUnitVectors(Z_AXIS, dir);
      }
      bucket.dummy.scale.setScalar(Math.max(size, 0.0001));
      bucket.dummy.updateMatrix();
      bucket.mesh.setMatrixAt(i, bucket.dummy.matrix);

      color.set(bullet.color);
      bucket.colorAttr.setXYZ(i, color.r, color.g, color.b);
      bucket.alphaAttr.setX(i, bullet.opacity);
      bucket.glowAttr.setX(i, bullet.glowIntensity);
    }

    for (const bucket of this.buckets.values()) {
      bucket.mesh.count = bucket.cursor;
      bucket.mesh.instanceMatrix.needsUpdate = true;
      bucket.colorAttr.needsUpdate = true;
      bucket.alphaAttr.needsUpdate = true;
      bucket.glowAttr.needsUpdate = true;
    }

    return { computed: bullets.length, rendered };
  }

  dispose(): void {
    for (const bucket of this.buckets.values()) {
      bucket.mesh.geometry.dispose();
      (bucket.mesh.material as THREE.Material).dispose();
    }
  }
}

const TRAIL_LINE_VERTEX = /* glsl */ `
  attribute vec3 color;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_LINE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

const MAX_TRAILS = RENDER_CAPACITY.trails;

/** Renders each bullet's recent-path trail as a fading additive line strip, rebuilt every frame. */
export class TrailRenderer {
  readonly mesh: THREE.LineSegments;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private alphas: Float32Array;
  private maxVerts: number;

  constructor(private samplesPerTrail: number) {
    const segmentsPerTrail = samplesPerTrail - 1;
    this.maxVerts = MAX_TRAILS * segmentsPerTrail * 2;
    this.positions = new Float32Array(this.maxVerts * 3);
    this.colors = new Float32Array(this.maxVerts * 3);
    this.alphas = new Float32Array(this.maxVerts);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
      vertexShader: TRAIL_LINE_VERTEX,
      fragmentShader: TRAIL_LINE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.LineSegments(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  update(trails: BulletTrail[]): RenderStats {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.geometry.getAttribute('color') as THREE.BufferAttribute;
    const alphaAttr = this.geometry.getAttribute('alpha') as THREE.BufferAttribute;

    const color = new THREE.Color();
    let vertCursor = 0;
    let rendered = 0;
    for (const trail of trails) {
      const pts = trail.points;
      const neededVerts = (pts.length - 1) * 2;
      if (vertCursor + neededVerts > this.maxVerts) break; // this trail (and all after it) would overflow the budget

      color.set(trail.color);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        posAttr.setXYZ(vertCursor, a.position[0], a.position[1], a.position[2]);
        posAttr.setXYZ(vertCursor + 1, b.position[0], b.position[1], b.position[2]);
        colAttr.setXYZ(vertCursor, color.r, color.g, color.b);
        colAttr.setXYZ(vertCursor + 1, color.r, color.g, color.b);
        // Fade the tail out; head end approaches ~0.6 so it blends into the bullet glow rather than overpowering it.
        alphaAttr.setX(vertCursor, a.t * a.t * 0.5);
        alphaAttr.setX(vertCursor + 1, b.t * b.t * 0.5);
        vertCursor += 2;
      }
      rendered++;
    }

    this.geometry.setDrawRange(0, vertCursor);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;

    return { computed: trails.length, rendered };
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const MAX_FLASHES = RENDER_CAPACITY.flashes;

/** Instanced camera-facing glow quads for muzzle flashes. */
export class FlashRenderer {
  readonly mesh: THREE.InstancedMesh;
  private colorAttr: THREE.InstancedBufferAttribute;
  private alphaAttr: THREE.InstancedBufferAttribute;
  private glowAttr: THREE.InstancedBufferAttribute;
  private dummy = new THREE.Object3D();

  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLASHES * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLASHES), 1).setUsage(THREE.DynamicDrawUsage);
    const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLASHES), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iColor', colorAttr);
    geometry.setAttribute('iAlpha', alphaAttr);
    geometry.setAttribute('iGlow', glowAttr);
    this.colorAttr = colorAttr;
    this.alphaAttr = alphaAttr;
    this.glowAttr = glowAttr;

    const material = new THREE.ShaderMaterial({
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader: BILLBOARD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_FLASHES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  update(flashes: FlashEvent[]): RenderStats {
    const color = new THREE.Color();
    const n = Math.min(flashes.length, MAX_FLASHES);
    for (let i = 0; i < n; i++) {
      const flash = flashes[i];
      const size = flash.size * (1 + flash.progress * 2.2);
      this.dummy.position.set(...flash.position);
      this.dummy.quaternion.identity();
      this.dummy.scale.setScalar(size);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      color.set(flash.color);
      this.colorAttr.setXYZ(i, color.r, color.g, color.b);
      this.alphaAttr.setX(i, 1 - flash.progress);
      this.glowAttr.setX(i, flash.intensity);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.glowAttr.needsUpdate = true;

    return { computed: flashes.length, rendered: n };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
