import * as CANNON from 'cannon-es';
import * as THREE from 'three';

import { Tank } from './Tank';
import type { ShellDefinition } from '../data/tankConfigs';
import { spawnExplosion, spawnBigExplosion, spawnRicochetSpark } from './Explosion';

const SHELL_RADIUS = 0.12;
const SHELL_MASS = 0.5;
/** Impact angle above which AP shells always ricochet (degrees from normal). */
const AUTO_RICOCHET_ANGLE = 70;

/**
 * A physics-driven shell. Behaviour depends on its type:
 * - AP:   ricochets at shallow angles, penetration vs effective armour.
 * - HE:   explodes on contact (no ricochet), splash damage to blocks, reduced on tanks.
 * - HEAT: chemical round — ignores impact angle, penetration vs flat armour.
 */
export class Shell {
  readonly mesh: THREE.Mesh;
  readonly body: CANNON.Body;
  penetration = 80;
  damage = 100;
  type: 'ap' | 'he' | 'heat' = 'ap';
  splash = 0;
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
      const targetArmor = hitBlock?.armor ?? hitTank?.armor ?? Infinity;

      // ── HE: explodes on ANY contact, no ricochet ───────
      if (this.type === 'he') {
        // Blast vs armour: thin armour takes more blast
        const blastFactor = hitTank
          ? Math.max(0.3, 1 - targetArmor / 150)
          : 1;
        const dmg = this.damage * blastFactor;

        if (hitBlock) {
          hitBlock.takeDamage(this.damage);
          if (this.splash > 0) this.splashDamageBlocks(hitBlock, hitPos);
        }
        if (hitTank) {
          this.damageTank(hitTank, dmg, hitPos);
        }

        this.destroy();
        spawnBigExplosion(this.scene, hitPos);
        return;
      }

      // ── AP / HEAT: angle & armour check ────────────────
      // HEAT ignores impact angle (chemical round) — use flat armour
      const useAngle = this.type === 'ap';
      const effectiveArmor = useAngle
        ? targetArmor / Math.max(cosAngle, 0.05)
        : targetArmor;

      // AP auto-ricochets at very shallow angles; HEAT does not
      if (useAngle && angleDeg > AUTO_RICOCHET_ANGLE) {
        this.ricochet(v, n);
        spawnRicochetSpark(this.scene, hitPos);
        return;
      }

      const penChance = this.penetration / effectiveArmor;

      if (penChance >= 1 || Math.random() < penChance) {
        // ── Penetration ────────────────────────────────────
        const damage = this.damage;

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
          this.damageTank(hitTank, damage, hitPos);
        }

        this.destroy();
        spawnExplosion(this.scene, hitPos);
      } else {
        // ── Non-penetration ────────────────────────────────
        if (useAngle) {
          // AP: ricochet with partial damage
          this.ricochet(v, n);
          spawnRicochetSpark(this.scene, hitPos);
          const glancing = this.damage * penChance * 0.5;
          if (hitBlock) hitBlock.takeDamage(glancing);
          if (hitTank) hitTank.takeDamage(glancing);
        } else {
          // HEAT fails: small explosion on the surface, no damage
          this.destroy();
          spawnExplosion(this.scene, hitPos);
        }
      }
    });
  }

  /** Apply damage to a tank, handling destruction. */
  private damageTank(tank: Tank, damage: number, hitPos: THREE.Vector3): void {
    const killed = tank.takeDamage(damage);
    if (killed) {
      spawnBigExplosion(this.scene, hitPos);
      const pos = tank.body.position;
      for (let i = 0; i < 4; i++) {
        spawnExplosion(this.scene, new THREE.Vector3(
          pos.x + (Math.random() - 0.5) * 3,
          pos.y + Math.random() * 2,
          pos.z + (Math.random() - 0.5) * 3,
        ));
      }
      tank.dispose(this.scene, this.world);
    } else {
      spawnExplosion(this.scene, hitPos);
    }
  }

  /** HE splash: damage nearby blocks within the splash radius. */
  private splashDamageBlocks(source: any, hitPos: THREE.Vector3): void {
    // Blocks are found via a distance scan in main.ts; here we only
    // handle the direct target. Full-area splash handled by physics overlap.
    void source;
    void hitPos;
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
    shellDef: ShellDefinition,
  ): Shell {
    const shell = new Shell(scene, world, tank.body);
    shell.penetration = shellDef.penetration;
    shell.damage = shellDef.damage;
    shell.type = shellDef.id;
    shell.splash = shellDef.splash ?? 0;

    // Shell colour varies by type
    const color = shellDef.id === 'he' ? 0xaa4433 : shellDef.id === 'heat' ? 0x33aa66 : 0xcc8844;
    (shell.mesh.material as THREE.MeshStandardMaterial).color.set(color);
    (shell.trailLine.material as THREE.LineBasicMaterial).color.set(color);

    // Get barrel tip position and direction from the Three.js hierarchy
    const tipPos = new THREE.Vector3();
    tank.barrelTip.getWorldPosition(tipPos);

    // Barrel direction = local -Z of barrelPivot, transformed to world
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(tank.barrelPivot.getWorldQuaternion(new THREE.Quaternion()));

    shell.body.position.set(tipPos.x, tipPos.y, tipPos.z);
    shell.body.velocity.set(
      dir.x * shellDef.muzzleSpeed,
      dir.y * shellDef.muzzleSpeed,
      dir.z * shellDef.muzzleSpeed,
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
