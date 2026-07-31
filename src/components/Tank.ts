import * as CANNON from 'cannon-es';
import * as THREE from 'three';

import type { TankConfig } from '../data/tankConfigs';

/**
 * Procedural tank with distinct Tiger I / KV-1 visual identities.
 *
 * Tiger I: stepped front hull, overlapping road wheels, boxy turret.
 * KV-1:    rounded turret, tall compact hull, large mantlet.
 */
export class Tank {
  readonly group: THREE.Group;
  readonly body: CANNON.Body;
  readonly turret: THREE.Group;
  readonly barrelPivot: THREE.Group;
  /** Empty Object3D at the muzzle tip — useful as a camera anchor. */
  readonly barrelTip: THREE.Object3D;
  readonly config: TankConfig;
  readonly maxHp: number;
  hp: number;
  readonly armor: number;
  readonly sideArmor: number;
  readonly turretArmor: number;
  alive = true;
  readonly name: string;
  readonly isTiger: boolean;

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    config: TankConfig,
    x = 0,
    z = 0,
  ) {
    this.config = config;
    this.name = config.name;
    this.maxHp = config.hp;
    this.hp = config.hp;
    this.armor = config.hullArmor;
    this.sideArmor = config.sideArmor;
    this.turretArmor = config.turretArmor;
    this.isTiger = config.id === 'tiger';

    this.group = new THREE.Group();
    this.turret = new THREE.Group();

    const [hW, hH, hL] = config.hullDimensions;
    const [tW, tH, tL] = config.turretDimensions;
    const hh = hH / 2;

    const hullMat = new THREE.MeshStandardMaterial({
      color: config.hullColor, roughness: 0.75, metalness: 0.25,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a, roughness: 0.85, metalness: 0.1,
    });
    const turretMat = new THREE.MeshStandardMaterial({
      color: config.turretColor, roughness: 0.65, metalness: 0.35,
    });
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a, roughness: 0.5, metalness: 0.6,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.9, metalness: 0.3,
    });

    // ═══════════════════════════════════════════════════════
    //  HULL
    // ═══════════════════════════════════════════════════════

    // Main hull body
    const hull = new THREE.Mesh(new THREE.BoxGeometry(hW, hH, hL), hullMat);
    hull.position.y = hh;
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.group.add(hull);

    if (this.isTiger) {
      // ── Tiger I stepped front ───────────────────────────
      // Upper front plate (stepped forward)
      const upperFront = new THREE.Mesh(
        new THREE.BoxGeometry(hW * 0.85, 0.25, 0.5),
        hullMat,
      );
      upperFront.position.set(0, hh + 0.25, -hL / 2 + 0.05);
      upperFront.rotation.x = -0.25;
      this.group.add(upperFront);

      // Lower front plate (slightly angled)
      const lowerFront = new THREE.Mesh(
        new THREE.BoxGeometry(hW * 0.9, 0.35, 0.35),
        hullMat,
      );
      lowerFront.position.set(0, hh - 0.25, -hL / 2 + 0.05);
      lowerFront.rotation.x = 0.2;
      this.group.add(lowerFront);

      // Side skirts (thin plates above treads)
      for (const side of [-1, 1]) {
        const skirt = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.15, hL * 0.85),
          hullMat,
        );
        skirt.position.set(side * (hW / 2 + 0.1), 0.2, 0);
        this.group.add(skirt);
      }

      // Rear exhaust
      const exhaust = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, 0.4, 6),
        darkMat,
      );
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(-hW * 0.25, 0.2, hL / 2 + 0.15);
      this.group.add(exhaust);
    } else {
      // ── KV-1 hull features ──────────────────────────────
      // Sloped upper front
      const slope = new THREE.Mesh(
        new THREE.BoxGeometry(hW * 0.9, 0.2, 0.5),
        hullMat,
      );
      slope.position.set(0, hh + 0.1, -hL / 2 + 0.05);
      slope.rotation.x = -0.4;
      this.group.add(slope);

      // Rear engine deck (slightly raised)
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(hW * 0.7, 0.08, hL * 0.3),
        hullMat,
      );
      deck.position.set(0, hh + 0.04, hL * 0.3);
      this.group.add(deck);
    }

    // ═══════════════════════════════════════════════════════
    //  TREADS & WHEELS
    // ═══════════════════════════════════════════════════════

    const treadGeo = new THREE.BoxGeometry(0.6, hH * 0.5, hL * 1.05);
    const treadL = new THREE.Mesh(treadGeo, darkMat);
    treadL.position.set(-hW / 2 - 0.18, hH * 0.2, 0);
    treadL.castShadow = true;
    this.group.add(treadL);
    const treadR = new THREE.Mesh(treadGeo, darkMat);
    treadR.position.set(hW / 2 + 0.18, hH * 0.2, 0);
    treadR.castShadow = true;
    this.group.add(treadR);

    if (this.isTiger) {
      // Tiger: 8 smaller overlapping road wheels
      const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.08, 8);
      for (let i = 0; i < 8; i++) {
        const wz = -hL * 0.42 + (i / 7) * hL * 0.84;
        for (const side of [-1, 1]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.x = Math.PI / 2;
          w.position.set(side * (hW / 2 + 0.18), 0.05, wz);
          this.group.add(w);
        }
      }
    } else {
      // KV-1: 6 larger spaced wheels
      const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 8);
      for (let i = 0; i < 6; i++) {
        const wz = -hL * 0.4 + (i / 5) * hL * 0.8;
        for (const side of [-1, 1]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.rotation.x = Math.PI / 2;
          w.position.set(side * (hW / 2 + 0.18), 0.05, wz);
          this.group.add(w);
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    //  TURRET
    // ═══════════════════════════════════════════════════════

    const turretY = hH + tH / 2;
    this.turret.position.y = turretY;
    this.group.add(this.turret);

    if (this.isTiger) {
      // Tiger: boxy rectangular turret
      const base = new THREE.Mesh(new THREE.BoxGeometry(tW, tH, tL), turretMat);
      base.position.y = 0;
      base.castShadow = true;
      base.receiveShadow = true;
      this.turret.add(base);

      // Slight chamfer / roof plate
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(tW * 0.85, 0.06, tL * 0.85),
        turretMat,
      );
      roof.position.y = tH / 2 + 0.03;
      this.turret.add(roof);

      // Commander's cupola (tall, cylindrical)
      const cupola = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.3, 0.18, 10),
        hullMat,
      );
      cupola.position.set(tW * 0.15, tH / 2 + 0.12, tL * 0.2);
      this.turret.add(cupola);

      // Loader's hatch
      const lHatch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.22, 0.06, 8),
        hullMat,
      );
      lHatch.position.set(-tW * 0.15, tH / 2 + 0.06, tL * 0.2);
      this.turret.add(lHatch);

    } else {
      // KV-1: rounded octagonal turret
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(tW * 0.6, tW * 0.55, tH, 8),
        turretMat,
      );
      base.position.y = 0;
      base.castShadow = true;
      base.receiveShadow = true;
      this.turret.add(base);

      // Additional turret ring / collar
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(tW * 0.65, tW * 0.7, 0.1, 8),
        turretMat,
      );
      collar.position.y = -tH / 2 - 0.05;
      this.turret.add(collar);

      // Round commander's hatch
      const hatch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 0.1, 10),
        hullMat,
      );
      hatch.position.set(0, tH / 2 + 0.05, tL * 0.15);
      this.turret.add(hatch);
    }

    // Turret ring (both)
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(tW * 0.55, tW * 0.55, 0.07, 16),
      darkMat,
    );
    ring.position.y = -tH / 2;
    this.turret.add(ring);

    // ═══════════════════════════════════════════════════════
    //  GUN (with barrel pivot for pitch)
    // ═══════════════════════════════════════════════════════

    const bLen = config.barrelLength;
    const barrelR = this.isTiger ? 0.15 : 0.13;

    // Pivot point at the turret face where the barrel meets the mantlet
    this.barrelPivot = new THREE.Group();
    this.barrelPivot.position.set(0, 0, -tL / 2 - 0.05);
    this.turret.add(this.barrelPivot);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(barrelR * 0.85, barrelR, bLen, 8),
      barrelMat,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -bLen / 2);
    barrel.castShadow = true;
    this.barrelPivot.add(barrel);

    // Muzzle brake
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(barrelR * 1.4, barrelR * 1.5, 0.08, 8),
      barrelMat,
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0, -bLen - 0.04);
    muzzle.castShadow = true;
    this.barrelPivot.add(muzzle);

    // Barrel tip marker for camera/shell-spawn reference
    this.barrelTip = new THREE.Object3D();
    this.barrelTip.position.set(0, 0, -bLen - 0.08);
    this.barrelPivot.add(this.barrelTip);

    // KV-1 gets a large mantlet
    if (!this.isTiger) {
      const mantlet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.6, 0.18, 10),
        hullMat,
      );
      mantlet.rotation.x = Math.PI / 2;
      mantlet.position.set(0, 0, -0.05);
      this.barrelPivot.add(mantlet);
    }

    // Tiger gets spare track links on front hull
    if (this.isTiger) {
      for (let i = -1; i <= 1; i++) {
        const link = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.14, 0.4),
          darkMat,
        );
        link.position.set(i * 0.3, hh + 0.15, -hL / 2 - 0.04);
        this.group.add(link);
      }
    }

    // Antenna (both)
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.014, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 }),
    );
    antenna.position.set(-tW * 0.25, tH / 2 + 0.25, tL * 0.1);
    antenna.rotation.x = 0.15;
    this.turret.add(antenna);

    // ═══════════════════════════════════════════════════════
    //  PHYSICS BODY
    // ═══════════════════════════════════════════════════════

    this.body = new CANNON.Body({ mass: 10 });
    this.body.fixedRotation = true;
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(hW / 2, hH / 2, hL / 2)));
    this.body.position.set(x, hH / 2, z);
    (this.body as any).userData = { isTank: true, tankRef: this };
    world.addBody(this.body);

    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  update(): void {
    this.group.position.copy(this.body.position as unknown as THREE.Vector3);
    this.group.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);
  }

  setTurretRotation(angle: number): void {
    this.turret.rotation.y = angle;
  }

  /** Set barrel pitch (elevation/depression) in radians.
   *  Positive = up, negative = down. Limits: -7° to +15°. */
  setBarrelPitch(pitch: number): void {
    const maxDown = -7 * (Math.PI / 180);
    const maxUp = 15 * (Math.PI / 180);
    this.barrelPivot.rotation.x = Math.max(maxDown, Math.min(maxUp, pitch));
  }

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount);
    return this.hp <= 0;
  }

  dispose(scene: THREE.Scene, world: CANNON.World): void {
    this.alive = false;
    scene.remove(this.group);
    world.removeBody(this.body);
  }
}
