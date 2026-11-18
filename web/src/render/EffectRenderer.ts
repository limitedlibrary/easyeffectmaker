import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { BulletShape, EffectDocument, EffectFrame } from '../core/types';
import { CameraRig } from './CameraRig';
import { BulletRenderer, FlashRenderer, TrailRenderer } from './Particles';
import { TRAIL_SAMPLES } from '../core/effects/rotatingBarrage';

function makeStarfield(): THREE.Points {
  const count = 600;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 30 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x6f7fae,
    size: 0.6,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new THREE.Points(geometry, material);
}

export class EffectRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private cameraRig: CameraRig;
  private bullets = new BulletRenderer();
  private trails: TrailRenderer;
  private flashes = new FlashRenderer();
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.cameraRig = new CameraRig(this.renderer.domElement);

    this.scene.add(makeStarfield());
    this.scene.add(this.bullets.group);
    this.trails = new TrailRenderer(TRAIL_SAMPLES);
    this.scene.add(this.trails.mesh);
    this.scene.add(this.flashes.mesh);

    const size = this.getSize();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.cameraRig.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 1.1, 0.55, 0.12);
    this.composer.addPass(this.bloomPass);

    this.resize();
  }

  private getSize(): { width: number; height: number } {
    const rect = this.container.getBoundingClientRect();
    return { width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) };
  }

  resize(): void {
    const { width, height } = this.getSize();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.cameraRig.setAspect(width, height);
    this.bloomPass.setSize(width, height);
  }

  setFreeCamera(enabled: boolean, doc: EffectDocument): void {
    this.cameraRig.setFreeMode(enabled, doc.camera);
  }

  isFreeCamera(): boolean {
    return this.cameraRig.isFreeMode();
  }

  render(doc: EffectDocument, frame: EffectFrame): void {
    this.scene.background = new THREE.Color(doc.stage.backgroundColor);

    this.bloomPass.enabled = doc.stage.bloom.enabled;
    this.bloomPass.strength = doc.stage.bloom.strength;
    this.bloomPass.radius = doc.stage.bloom.radius;
    this.bloomPass.threshold = doc.stage.bloom.threshold;

    this.cameraRig.update(doc.camera, frame.time);

    const shapeByLayer = new Map<string, BulletShape>();
    const sizeByLayer = new Map<string, number>();
    for (const layer of doc.layers) {
      shapeByLayer.set(layer.id, layer.bullet.shape);
      sizeByLayer.set(layer.id, layer.bullet.size);
    }

    this.bullets.update(frame.bullets, shapeByLayer, sizeByLayer);
    this.trails.update(frame.trails);
    this.flashes.update(frame.flashes);

    this.composer.render();
  }

  dispose(): void {
    this.bullets.dispose();
    this.trails.dispose();
    this.flashes.dispose();
    this.cameraRig.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
