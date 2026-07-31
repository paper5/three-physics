import * as THREE from 'three';

import type { Tank } from '../components/Tank';

const LERP_FACTOR = 0.08;

export class FollowCamera {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly origFov: number;
  distance: number;
  height: number;

  mode: 'third-person' | 'sniper' = 'third-person';

  // Shake
  private shakeAmount = 0;
  private shakeDecay = 4; // per second

  constructor(
    camera: THREE.PerspectiveCamera,
    opts?: Partial<{ distance: number; height: number }>,
  ) {
    this.camera = camera;
    this.origFov = camera.fov;
    this.distance = opts?.distance ?? 14;
    this.height = opts?.height ?? 10;
  }

  /** Trigger a shake. Call from explosion handler. */
  triggerShake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  update(tank: Tank, dt = 1 / 60): void {
    if (this.mode === 'sniper') {
      this.updateSniper(tank);
    } else {
      this.updateThirdPerson(tank);
    }
    // Apply shake on top of whatever the camera mode did
    this.applyShake(dt);
  }

  private updateThirdPerson(tank: Tank): void {
    this.camera.fov = this.origFov;
    this.camera.updateProjectionMatrix();

    const fwd = new THREE.Vector3(0, 0, -1);
    fwd.applyQuaternion(tank.group.quaternion);

    const target = new THREE.Vector3()
      .copy(tank.group.position)
      .add(fwd.clone().multiplyScalar(-this.distance))
      .add(new THREE.Vector3(0, this.height, 0));

    this.camera.position.lerp(target, LERP_FACTOR);
    this.camera.lookAt(tank.group.position);
  }

  private updateSniper(tank: Tank): void {
    // Moderate zoom — not too tight
    this.camera.fov = 22;
    this.camera.updateProjectionMatrix();

    const tipPos = new THREE.Vector3();
    tank.barrelTip.getWorldPosition(tipPos);
    this.camera.position.copy(tipPos);

    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(tank.barrelPivot.getWorldQuaternion(new THREE.Quaternion()));
    this.camera.lookAt(tipPos.clone().add(dir.multiplyScalar(50)));
  }

  private applyShake(dt: number): void {
    if (this.shakeAmount < 0.001) return;
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * this.shakeAmount * 2,
      (Math.random() - 0.5) * this.shakeAmount * 2,
      (Math.random() - 0.5) * this.shakeAmount * 2,
    );
    this.camera.position.add(offset);
    this.shakeAmount -= this.shakeDecay * dt;
    if (this.shakeAmount < 0) this.shakeAmount = 0;
  }
}
