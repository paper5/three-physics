import * as CANNON from 'cannon-es';
import * as THREE from 'three';

const COLORS = [0x8b5e3c, 0x7a5030, 0x6b4528, 0x9a6e4a];

/**
 * A physics-simulated destructible block (brick).
 * HP = 50, Armor = 20mm. Colour shifts brown → yellow → red as HP drops.
 */
export class Block {
  readonly mesh: THREE.Mesh;
  readonly body: CANNON.Body;
  readonly maxHp: number;
  hp: number;
  readonly armor = 20; // mm
  alive = true;

  private readonly baseColor: THREE.Color;

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    position: THREE.Vector3,
    size: THREE.Vector3,
    color?: number,
    hp = 50,
  ) {
    this.maxHp = hp;
    this.hp = hp;
    this.baseColor = new THREE.Color(color ?? COLORS[Math.floor(Math.random() * COLORS.length)]);

    // ── Three.js visual ──
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mat = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      roughness: 0.7,
      metalness: 0.1,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // ── Cannon physics body ──
    const half = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
    this.body = new CANNON.Body({ mass: 2 });
    this.body.addShape(new CANNON.Box(half));
    this.body.position.set(position.x, position.y, position.z);
    this.body.linearDamping = 0.3;
    this.body.angularDamping = 0.3;
    this.body.collisionFilterGroup = 1;
    this.body.collisionFilterMask = -1;
    (this.body as any).userData = { isBlock: true, blockRef: this };
    world.addBody(this.body);
  }

  /** Apply damage, update colour, return true if destroyed. */
  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.updateColor();
    if (this.hp <= 0) return true;
    return false;
  }

  private updateColor(): void {
    const t = this.hp / this.maxHp;
    const c = new THREE.Color();
    if (t > 0.5) {
      c.lerpColors(this.baseColor, new THREE.Color(0xccaa00), 1 - (t - 0.5) * 2);
    } else {
      c.lerpColors(new THREE.Color(0xccaa00), new THREE.Color(0xff3300), 1 - t * 2);
    }
    (this.mesh.material as THREE.MeshStandardMaterial).color.copy(c);
  }

  /** Sync physics → mesh each frame. */
  update(): void {
    if (!this.alive) return;
    this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
    this.mesh.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);
  }

  /** Remove from scene and world. */
  destroy(scene: THREE.Scene, world: CANNON.World): void {
    if (!this.alive) return;
    this.alive = false;
    scene.remove(this.mesh);
    world.removeBody(this.body);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
