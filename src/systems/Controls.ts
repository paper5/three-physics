import * as CANNON from 'cannon-es';
import * as THREE from 'three';

import { Shell } from '../components/Shell';
import { Tank } from '../components/Tank';

/**
 * Drives a Tank via WASD and tracks the mouse cursor for turret aiming.
 *
 * - W / S  → local forward / backward velocity on the physics body
 * - A / D  → hull rotation (direct quaternion)
 * - Mouse  → turret independently rotates to face the ground intersection
 * - Left-click → fire a shell from the barrel tip
 */
export class TankControls {
  private readonly keys = new Set<string>();
  private readonly mouse = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private reloadTime = 2.5;

  private tank: Tank | null = null;
  private scene: THREE.Scene | null = null;
  private world: CANNON.World | null = null;

  private lastFireTime = 0;

  /** Barrel pitch in radians (positive = up). */
  barrelPitch = 0;
  /** Auto-computed barrel pitch from ground-aim intersection. */
  autoBarrelPitch = 0;
  /** Toggle between third-person and sniper view. */
  sniperMode = false;

  /** Callback fired each time a shell is spawned. */
  onShellFired?: () => void;
  /** Callback for scroll-wheel zoom: +1 = zoom in, -1 = zoom out. */
  onZoom?: (dir: number) => void;

  readonly shells: Shell[] = [];

  /** Normalised device coordinates of the mouse (-1..1). */
  get mouseNDC(): THREE.Vector2 {
    return this.mouse;
  }

  constructor(domElement: HTMLElement) {
    // ── Keyboard (on window so no click-to-focus needed) ──
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (['w', 'a', 's', 'd', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
    });

    // ── Mouse ─────────────────────────────────────────────
    domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    domElement.addEventListener('wheel', (e) => {
      // Forward zoom callback (handled in main.ts)
      this.onZoom?.(e.deltaY > 0 ? -1 : 1);
    }, { passive: true });
    domElement.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      // Barrel pitch accumulates from vertical mouse movement
      this.barrelPitch -= e.movementY * 0.003;
    });

    // ── Left-click → fire, Right-click → toggle sniper ───
    domElement.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.sniperMode = !this.sniperMode;
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      if (!this.tank || !this.scene || !this.world) return;
      if (this.reloadProgress < 1) return;

      const shell = Shell.fire(
        this.scene, this.world, this.tank,
        this.tank.config.muzzleSpeed,
        this.tank.config.shellPenetration,
      );
      this.shells.push(shell);
      this.lastFireTime = performance.now();
      this.onShellFired?.();
    });
  }

  /** Reload progress 0..1 (1 = ready to fire). */
  get reloadProgress(): number {
    const elapsed = (performance.now() - this.lastFireTime) / 1000;
    return Math.min(1, elapsed / this.reloadTime);
  }

  /** Bind the tank, scene and world that this control set operates on. */
  bind(tank: Tank, scene: THREE.Scene, world: CANNON.World): void {
    this.tank = tank;
    this.scene = scene;
    this.world = world;
    this.reloadTime = tank.config.reloadTime;
  }

  // ── Input queries ───────────────────────────────────────

  get forward(): boolean {
    return this.keys.has('w');
  }
  get backward(): boolean {
    return this.keys.has('s');
  }
  get left(): boolean {
    return this.keys.has('a');
  }
  get right(): boolean {
    return this.keys.has('d');
  }

  /**
   * Raycast the mouse onto y=0 and return the world-space intersection point,
   * or `null` if the ray is parallel to the ground.
   */
  getIntersection(camera: THREE.PerspectiveCamera): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mouse, camera);

    const ray = this.raycaster.ray;
    const denom = ray.direction.dot(this.groundPlane.normal);

    if (Math.abs(denom) < 1e-6) return null;

    const t = -(ray.origin.dot(this.groundPlane.normal) + this.groundPlane.constant) / denom;
    if (t < 0) return null;

    return ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
  }

  // ── Per-frame updates ───────────────────────────────────

  /**
   * Configure a tank body for stable driving.
   */
  static setupBody(body: CANNON.Body): void {
    body.linearDamping = 0.3;
    body.angularDamping = 0.3;
  }

  /**
   * Apply driving input and turret tracking to the bound tank.
   *
   * Kinematic movement: directly updates body.position instead of setting
   * velocity, so the tank moves at a consistent speed in every direction.
   */
  updateTank(
    speed: number,
    turnSpeed: number,
    camera: THREE.PerspectiveCamera,
  ): void {
    const tank = this.tank;
    if (!tank) return;
    const body = tank.body;
    const dt = 1 / 60;

    // ── Forward / backward (position update, not velocity) ──
    let forwardSpeed = 0;
    if (this.forward) forwardSpeed = speed;
    if (this.backward) forwardSpeed = -speed;

    if (forwardSpeed !== 0) {
      const dir = new CANNON.Vec3(0, 0, -1);
      body.quaternion.vmult(dir, dir);
      dir.y = 0;
      dir.normalize();

      body.position.x += dir.x * forwardSpeed * dt;
      body.position.z += dir.z * forwardSpeed * dt;
    }
    // Zero horizontal velocity so physics solver doesn't fight us
    body.velocity.set(0, body.velocity.y, 0);

    // ── Hull turn via direct quaternion ───────────────────
    let turnAngle = 0;
    if (this.left) turnAngle = turnSpeed * dt;
    if (this.right) turnAngle = -turnSpeed * dt;

    if (turnAngle !== 0) {
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), turnAngle);
      body.quaternion = q.mult(body.quaternion);
      body.quaternion.normalize();
    }

    // ── Turret tracking ───────────────────────────────────
    const intersect = this.getIntersection(camera);
    if (intersect) {
      const tankPos = new THREE.Vector3(body.position.x, 0, body.position.z);
      const toTarget = new THREE.Vector3().copy(intersect).sub(tankPos);
      toTarget.y = 0;
      if (toTarget.lengthSq() > 0.001) {
        toTarget.normalize();
        const fwd = new CANNON.Vec3(0, 0, -1);
        body.quaternion.vmult(fwd, fwd);
        const tankFwd = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
        const angle = Math.atan2(
          tankFwd.x * toTarget.z - tankFwd.z * toTarget.x,
          tankFwd.x * toTarget.x + tankFwd.z * toTarget.z,
        );
        tank.setTurretRotation(-angle);

        // ── Auto barrel pitch (aim at intersection point) ──
        // Transform intersection into barrelPivot local space, compute pitch
        const pivotWorld = new THREE.Vector3();
        tank.barrelPivot.getWorldPosition(pivotWorld);
        const localTarget = new THREE.Vector3().copy(intersect).sub(pivotWorld);
        // BarrelPivot forward is -Z in its local space
        const dist = Math.sqrt(localTarget.x * localTarget.x + localTarget.z * localTarget.z);
        this.autoBarrelPitch = Math.atan2(localTarget.y, dist);
      }
    }
  }

  /** Update all active shells (sync + cleanup destroyed). */
  updateShells(dt: number): void {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i];
      shell.update(dt);

      // Destroy shells that fall below the world or travel too far
      if (
        shell.body.position.y < -5 ||
        shell.body.position.length() > 100
      ) {
        shell.destroy();
      }

      if (!shell.alive) {
        this.shells.splice(i, 1);
      }
    }
  }
}
