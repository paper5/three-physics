import * as CANNON from 'cannon-es';
import * as THREE from 'three';

import { Shell } from '../components/Shell';
import { Tank } from '../components/Tank';
import type { ShellDefinition } from '../data/tankConfigs';

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
  /** Sniper aim offset (radians): X = turret yaw, Y = barrel pitch. */
  sniperAimX = 0;
  sniperAimY = 0;
  private readonly sniperSensitivity = 0.0012;

  /** Index into the tank's shells array. */
  currentShellIndex = 0;

  /** The currently selected shell definition. */
  get currentShell(): ShellDefinition {
    return this.tank?.config.shells[this.currentShellIndex] ?? this.tank?.config.shells[0]!;
  }

  /** Callback fired each time a shell is spawned. */
  onShellFired?: () => void;
  /** Callback when the player switches shell type. */
  onShellSwitch?: (shell: ShellDefinition) => void;
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
      // Shell switching: 1 / 2 / 3
      if (this.tank && ['1', '2', '3'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < this.tank.config.shells.length) {
          this.currentShellIndex = idx;
          this.onShellSwitch?.(this.currentShell);
        }
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

      if (this.sniperMode) {
        // Low-sensitivity aim in sniper mode
        this.sniperAimX -= e.movementX * this.sniperSensitivity;
        this.sniperAimY -= e.movementY * this.sniperSensitivity;
      } else {
        // Barrel pitch accumulates from vertical mouse movement
        this.barrelPitch -= e.movementY * 0.003;
      }
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

      const shell = Shell.fire(this.scene, this.world, this.tank, this.currentShell);
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

  /** Instantly complete the reload (ammo consumable). */
  forceReloadReady(): void {
    this.lastFireTime = performance.now() - this.reloadTime * 1000;
  }

  /** Apply a reload-time multiplier (upgrade: <1 = faster reload). */
  setReloadMult(mult: number): void {
    if (this.tank) this.reloadTime = this.tank.config.reloadTime * mult;
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
    if (this.sniperMode) {
      // Sniper: direct aim control from mouse deltas
      if (tank.isTD) {
        // TD: rotate the whole hull toward sniper aim
        this.turnHullToAbsAngle(body, this.hullForwardAngle(body) + this.sniperAimX, dt);
      } else {
        tank.setTurretRotation(this.sniperAimX);
      }
      this.autoBarrelPitch = this.sniperAimY;
    } else {
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
          if (tank.isTD) {
            // TD: rotate the hull toward the target — but only when not driving,
            // so WASD movement isn't fought by the auto-aim
            const driving = this.forward || this.backward || this.left || this.right;
            if (!driving) {
              // Use the target's absolute direction angle (fixes inverted turn)
              this.turnHullToAbsAngle(body, Math.atan2(toTarget.x, toTarget.z), dt);
            }
          } else {
            tank.setTurretRotation(-angle);
          }

          // ── Auto barrel pitch (aim at intersection point) ──
          const pivotWorld = new THREE.Vector3();
          tank.barrelPivot.getWorldPosition(pivotWorld);
          const localTarget = new THREE.Vector3().copy(intersect).sub(pivotWorld);
          const dist = Math.sqrt(localTarget.x * localTarget.x + localTarget.z * localTarget.z);
          this.autoBarrelPitch = Math.atan2(localTarget.y, dist);
        }
      }
    }
  }

  /** Current hull forward angle in the XZ plane (atan2 of forward.x, forward.z). */
  private hullForwardAngle(body: CANNON.Body): number {
    const fwd = new CANNON.Vec3(0, 0, -1);
    body.quaternion.vmult(fwd, fwd);
    return Math.atan2(fwd.x, fwd.z);
  }

  /** Slowly rotate the hull so its forward direction reaches the given absolute angle.
   *  Dead zone prevents jitter from tiny cursor movements. */
  private turnHullToAbsAngle(body: CANNON.Body, targetAngle: number, dt: number): void {
    const current = this.hullForwardAngle(body);
    let diff = targetAngle - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // Dead zone — ignore tiny angular errors (≈4°) so the hull isn't twitchy
    const DEAD_ZONE = 0.07;
    if (Math.abs(diff) < DEAD_ZONE) return;

    // Slow, deliberate hull traverse for TDs (≈34°/s)
    const maxTurn = 0.6 * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), turn);
    body.quaternion = q.mult(body.quaternion);
    body.quaternion.normalize();
  }

  /**
   * Called each frame in sniper mode: clamps aim to reasonable limits.
   * (No auto-recenter — the aim stays where you put it.)
   */
  updateSniperAim(_dt: number): void {
    if (!this.sniperMode) return;

    // Clamp turret yaw ±90°, barrel pitch −7° to +15°
    this.sniperAimX = THREE.MathUtils.clamp(this.sniperAimX, -Math.PI / 2, Math.PI / 2);
    this.sniperAimY = THREE.MathUtils.clamp(
      this.sniperAimY,
      -7 * (Math.PI / 180),
      15 * (Math.PI / 180),
    );
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
