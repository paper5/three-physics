import * as CANNON from 'cannon-es';
import * as THREE from 'three';

import { Tank } from './Tank';
import { spawnExplosion, spawnRicochetSpark } from './Explosion';

const SHELL_RADIUS = 0.12;
const SHELL_MASS = 0.5;
/** Shell penetration in mm. */
const PENETRATION = 80;
/** Impact angle above which the shell always ricochets (degrees from normal). */
const AUTO_RICOCHET_ANGLE = 70;

/**
 * A physics-driven shell with a penetration system.
 *
 * On impact:
 * 1. Compute impact angle from surface normal.
 * 2. If angle > 70° from normal → guaranteed ricochet.
 * 3. Otherwise compare penetration vs effective armour (armour / cos(angle)).
 * 4. If pen > effective armour → penetrate (full damage).
 * 5. Else roll RNG (pen / effective armour) → partial pen or ricochet.
 */
export class Shell {
  readonly mesh: THREE.Mesh;
  readonly body: CANNON.Body;
  penetration = PENETRATION;
  alive = true;
  private age = 0;
  private scene: THREE.Scene;
  private world: CANNON.World;
  private trailLine: THREE.Line;
  private prevPos = new THREE.Vector3();

  private constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    tankBody: CANNON.Body,
  ) {
    this.scene = scene;
    this.world = world;
    // ── Three.js visual ──
    const geo = new THREE.SphereGeometry(SHELL_RADIUS, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xcc8844,
      emissive: 0x442200,
      emissiveIntensity: 0.3,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    // Tracer trail
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(6); // 2 points × 3 coords
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trailMatLine = new THREE.LineBasicMaterial({
      color: 0xff8844,
      transparent: true,
      opacity: 0.4,
    });
    this.trailLine = new THREE.Line(trailGeo, trailMatLine);
    scene.add(this.trailLine);

    // ── Cannon physics body ──
    this.body = new CANNON.Body({ mass: SHELL_MASS });
    this.body.addShape(new CANNON.Sphere(SHELL_RADIUS));
    this.body.linearDamping = 0.1;
    this.body.angularDamping = 0.5;
    this.body.collisionFilterGroup = 2;
    this.body.collisionFilterMask = 1;
    world.addBody(this.body);

    // ── Collision handler ─────────────────────────────────
    this.body.addEventListener('collide', (event: any) => {
      if (!this.alive) return;
      const contact: CANNON.ContactEquation = event.contact;
      const hitBody: CANNON.Body = event.body;

      if (hitBody === tankBody) return;

      // Normal pointing toward the shell
      const n = contact.ni.clone();
      if (contact.bi === this.body) { n.x *= -1; n.y *= -1; n.z *= -1; }

      const v = this.body.velocity;
      const speed = v.length();
      if (speed < 0.01) return;

      const vNorm = v.clone();
      vNorm.normalize();
      const cosAngle = Math.abs(vNorm.dot(n));
      const angleDeg = Math.acos(Math.min(cosAngle, 1)) * (180 / Math.PI);

      // World-space hit position
      const hitPos = new THREE.Vector3(
        this.body.position.x,
        this.body.position.y,
        this.body.position.z,
      );

      // ── Resolve hit ─────────────────────────────────────
      const hitBlock = (hitBody as any).userData?.isBlock ? (hitBody as any).userData.blockRef : null;
      const hitTank = (hitBody as any).userData?.isTank ? (hitBody as any).userData.tankRef : null;

      // Auto-ricochet at very shallow angles
      if (angleDeg > AUTO_RICOCHET_ANGLE) {
        this.ricochet(v, n);
        spawnRicochetSpark(this.scene, hitPos);
        return;
      }

      // Determine if we penetrate
      const targetArmor = hitBlock?.armor ?? hitTank?.armor ?? Infinity;
      const effectiveArmor = targetArmor / Math.max(cosAngle, 0.05);
      const penChance = this.penetration / effectiveArmor;

      if (penChance >= 1 || Math.random() < penChance) {
        // ── Penetration ────────────────────────────────────
        const damage = this.penetration * 0.6; // damage ≈ 48 per hit

        if (hitBlock) {
          const impulse = new CANNON.Vec3();
          v.clone().scale(this.body.mass * 1.5, impulse);
          const cp = new CANNON.Vec3();
          if (contact.bi === this.body) cp.copy(contact.bi.position).vadd(contact.ri, cp);
          else cp.copy(contact.bj.position).vadd(contact.rj, cp);
          hitBody.applyImpulse(impulse, cp);

          if (hitBlock.takeDamage(damage)) {
            spawnExplosion(this.scene, hitPos);
          }
        }
        if (hitTank) {
          hitTank.takeDamage(damage);
          spawnExplosion(this.scene, hitPos);
        }

        this.destroy();
        spawnExplosion(this.scene, hitPos);
      } else {
        // ── Ricochet (RNG) ────────────────────────────────
        this.ricochet(v, n);
        spawnRicochetSpark(this.scene, hitPos);
        // Apply partial damage from glancing blow
        if (hitBlock) hitBlock.takeDamage(penChance * 15);
      }
    });
  }

  /** Reflect velocity off surface normal with 20% energy loss. */
  private ricochet(v: CANNON.Vec3, n: CANNON.Vec3): void {
    const dot = v.dot(n);
    v.x = (v.x - 2 * dot * n.x) * 0.8;
    v.y = (v.y - 2 * dot * n.y) * 0.8;
    v.z = (v.z - 2 * dot * n.z) * 0.8;
  }

  /** Factory: spawn a shell at the barrel tip. */
  static fire(
    scene: THREE.Scene,
    world: CANNON.World,
    tank: Tank,
    muzzleSpeed: number,
    penetration: number,
  ): Shell {
    const shell = new Shell(scene, world, tank.body);
    shell.penetration = penetration;

    // Get barrel tip position and direction from the Three.js hierarchy
    const tipPos = new THREE.Vector3();
    tank.barrelTip.getWorldPosition(tipPos);

    // Barrel direction = local -Z of barrelPivot, transformed to world
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(tank.barrelPivot.getWorldQuaternion(new THREE.Quaternion()));

    shell.body.position.set(tipPos.x, tipPos.y, tipPos.z);
    shell.body.velocity.set(
      dir.x * muzzleSpeed,
      dir.y * muzzleSpeed,
      dir.z * muzzleSpeed,
    );
    return shell;
  }

  /** Sync physics body → mesh each frame. Auto-destroy after 5 seconds. */
  update(dt: number): void {
    if (!this.alive) return;
    this.age += dt;
    if (this.age > 5) {
      this.body.position.y = -100;
      return;
    }

    // Update trail line (current → previous position)
    const pos = this.body.position;
    const attr = this.trailLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attr.array as Float32Array;
    array[0] = this.prevPos.x; array[1] = this.prevPos.y; array[2] = this.prevPos.z;
    array[3] = pos.x; array[4] = pos.y; array[5] = pos.z;
    attr.needsUpdate = true;

    this.prevPos.set(pos.x, pos.y, pos.z);

    this.mesh.position.copy(pos as unknown as THREE.Vector3);
    this.mesh.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.scene.remove(this.mesh);
    this.scene.remove(this.trailLine);
    this.trailLine.geometry.dispose();
    (this.trailLine.material as THREE.Material).dispose();
    this.world.removeBody(this.body);
  }
}
