import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export type ConsumableKind = 'reload' | 'heal' | 'speed';

const KIND_INFO: Record<ConsumableKind, { color: number; emissive: number; label: string }> = {
  reload: { color: 0x33aa44, emissive: 0x22cc44, label: 'AMMO' },
  heal:   { color: 0xcc3344, emissive: 0xff4466, label: 'REPAIR' },
  speed:  { color: 0x3366cc, emissive: 0x4488ff, label: 'SPEED' },
};

/**
 * A floating pickup that grants a bonus when driven over:
 * - reload: instantly completes the reload
 * - heal:   restores 40% of max HP
 * - speed:  +60% speed for 5 seconds
 */
export class Consumable {
  readonly kind: ConsumableKind;
  readonly mesh: THREE.Group;
  readonly body: CANNON.Body;
  alive = true;
  private readonly bobSpeed: number;
  private readonly bobPhase: number;

  constructor(scene: THREE.Scene, world: CANNON.World, position: THREE.Vector3, kind: ConsumableKind) {
    this.kind = kind;
    this.bobSpeed = 1.5 + Math.random() * 1;
    this.bobPhase = Math.random() * Math.PI * 2;

    const info = KIND_INFO[kind];

    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);

    // Crate body
    const crateMat = new THREE.MeshStandardMaterial({
      color: info.color,
      emissive: info.emissive,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.1,
    });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), crateMat);
    crate.castShadow = true;
    this.mesh.add(crate);

    // Glow ring at base
    const ringMat = new THREE.MeshBasicMaterial({
      color: info.emissive,
      transparent: true,
      opacity: 0.4,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 20), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.mesh.add(ring);

    // Light pillar
    const pillarMat = new THREE.MeshBasicMaterial({
      color: info.emissive,
      transparent: true,
      opacity: 0.12,
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 8), pillarMat);
    pillar.position.y = 1.5;
    this.mesh.add(pillar);

    scene.add(this.mesh);

    // Physics body (static sensor)
    this.body = new CANNON.Body({ mass: 0 });
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, 0.35, 0.35)));
    this.body.position.set(position.x, position.y, position.z);
    world.addBody(this.body);
  }

  /** Bob up and down. Call each frame. */
  update(dt: number, time: number): void {
    if (!this.alive) return;
    this.mesh.position.y = 0.5 + Math.sin(time * this.bobSpeed + this.bobPhase) * 0.15;
    this.mesh.rotation.y += dt * 0.8;
    this.body.position.x = this.mesh.position.x;
    this.body.position.z = this.mesh.position.z;
    this.body.position.y = this.mesh.position.y;
  }

  /** Remove from scene and world. */
  destroy(scene: THREE.Scene, world: CANNON.World): void {
    if (!this.alive) return;
    this.alive = false;
    scene.remove(this.mesh);
    world.removeBody(this.body);
  }
}
