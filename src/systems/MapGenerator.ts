import * as CANNON from 'cannon-es';
import * as THREE from 'three';

/**
 * Generates map features: player/enemy bases and a central flag.
 * Terrain hills are part of the heightmapped ground.
 */
export class MapGenerator {
  readonly objects: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.createBase(scene, world, 48, 'green');
    this.createBase(scene, world, -48, 'red');
    this.createFlag(scene, world);
  }

  // ── Bases ────────────────────────────────────────────────
  private createBase(
    scene: THREE.Scene, world: CANNON.World, z: number, team: 'green' | 'red',
  ): void {
    const isGreen = team === 'green';
    const baseMat = new THREE.MeshStandardMaterial({
      color: isGreen ? 0x3a7a2a : 0x8a2a1a,
      roughness: 0.8,
      metalness: 0.1,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: isGreen ? 0x4a5a33 : 0x6a3a2a,
      roughness: 0.85,
      metalness: 0.1,
    });

    const plat = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 6), baseMat);
    plat.position.set(0, 0.2, z);
    plat.receiveShadow = true;
    plat.castShadow = true;
    scene.add(plat);
    this.objects.push(plat);
    const platBody = new CANNON.Body({ mass: 0 });
    platBody.addShape(new CANNON.Box(new CANNON.Vec3(4, 0.2, 3)));
    platBody.position.set(0, 0.2, z);
    world.addBody(platBody);

    const wallPositions: [number, number, number, number, number][] = [
      [0, 0.5, z - 3.2, 8, 0.6],
      [0, 0.5, z + 3.2, 8, 0.6],
      [-4.2, 0.5, z, 0.4, 0.6],
      [4.2, 0.5, z, 0.4, 0.6],
    ];
    for (const [wx, wy, wz, wsx, wsy] of wallPositions) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(wsx, wsy, 0.4), wallMat);
      wall.position.set(wx, wy, wz);
      wall.castShadow = true;
      scene.add(wall);
      this.objects.push(wall);
      const wBody = new CANNON.Body({ mass: 0 });
      wBody.addShape(new CANNON.Box(new CANNON.Vec3(wsx / 2, wsy / 2, 0.2)));
      wBody.position.set(wx, wy, wz);
      world.addBody(wBody);
    }
  }

  // ── Flag ─────────────────────────────────────────────────
  private createFlag(scene: THREE.Scene, world: CANNON.World): void {
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x888888, metalness: 0.6, roughness: 0.3,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 8), poleMat);
    pole.position.set(0, 1.5, 0);
    pole.castShadow = true;
    scene.add(pole);
    this.objects.push(pole);
    const pBody = new CANNON.Body({ mass: 0 });
    pBody.addShape(new CANNON.Cylinder(0.08, 0.1, 3, 6));
    pBody.position.set(0, 1.5, 0);
    world.addBody(pBody);

    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xffff44,
      emissive: 0xffaa00,
      emissiveIntensity: 0.3,
      side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), flagMat);
    flag.position.set(0.4, 2.8, 0);
    scene.add(flag);
    this.objects.push(flag);

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffff44,
      emissive: 0xffaa00,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 24), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.02, 0);
    scene.add(glow);
    this.objects.push(glow);
  }
}
