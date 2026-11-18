import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraConfig } from '../core/types';

/**
 * Drives the preview camera. Two modes:
 *  - "effect" mode (default): camera follows `CameraConfig` exactly — the
 *    position/target/fov/orbit baked into the saved JSON, i.e. what a
 *    Blender re-implementation is expected to reproduce.
 *  - "free" mode: OrbitControls take over so the user can freely inspect
 *    the scene while editing. This is a preview-only convenience and is
 *    never written back into the document.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private freeMode = false;

  constructor(domElement: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enabled = false;
  }

  setFreeMode(enabled: boolean, config: CameraConfig): void {
    this.freeMode = enabled;
    this.controls.enabled = enabled;
    if (enabled) {
      this.controls.target.set(...config.target);
      this.controls.update();
    }
  }

  isFreeMode(): boolean {
    return this.freeMode;
  }

  update(config: CameraConfig, time: number): void {
    this.camera.fov = config.fovDeg;
    this.camera.updateProjectionMatrix();

    if (this.freeMode) {
      this.controls.update();
      return;
    }

    const angle = (config.orbitSpeedDeg * time * Math.PI) / 180;
    const axis = new THREE.Vector3(...config.orbitAxis).normalize();
    const basePos = new THREE.Vector3(...config.position);
    const target = new THREE.Vector3(...config.target);

    const rotated = basePos.clone().sub(target).applyAxisAngle(axis, angle).add(target);
    this.camera.position.copy(rotated);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
  }

  setAspect(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
