import * as CANNON from 'cannon-es';
import * as THREE from 'three';

/**
 * Generates terrain features: hills, player/enemy bases, and a central flag.
 */
export class MapGenerator {
  readonly objects: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.createHills(scene, world);
    this.createBase(scene, world, 48, 'green');
    this.createBase(scene, world, -48, 'red');
    this.createFlag(scene, world);
  }

  // ── Hills ────────────────────────────────────────────────
  private createHills(scene: THREE.Scene, world: CANNON.World): void {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x5a4a3a,
      roughness: 0.95,
      metalness: 0.0,
    });
    // Scatter mounds across the map
    const positions: [number, number, number, number, number][] = [
      [-25, 0, -18, 5, 1.5],  [30, 0, -15, 4, 1.0],
      [-35, 0, 12, 3.5, 0.8], [28, 0, 20, 6, 1.8],
      [-12, 0, -35, 4, 0.9],  [18, 0, -32, 3, 0.7],
      [-40, 0, -28, 5, 1.2],  [42, 0, 28, 4.5, 1.1],
      [-18, 0, 38, 4, 0.8],   [22, 0, -45, 3, 0.6],
      [-8, 0, 0, 2.5, 0.5],   [8, 0, -8, 2, 0.4],
    ];
    for (const [x, , z, w, h] of positions) {
      const geo = new THREE.BoxGeometry(w, h, w * 0.7);
      const mesh = new THREE.Mesh(geo, rockMat);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.objects.push(mesh);

      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, w * 0.35)));
      body.position.set(x, h / 2, z);
      world.addBody(body);
    }
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

    // Platform
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

    // Walls around the base
    const wallPositions: [number, number, number, number, number][] = [
      [0, 0.5, z - 3.2, 8, 0.6],  // front
      [0, 0.5, z + 3.2, 8, 0.6],  // back
      [-4.2, 0.5, z, 0.4, 0.6],   // left
      [4.2, 0.5, z, 0.4, 0.6],    // right
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
    // Pole
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x888888, metalness: 0.6, roughness: 0.3,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 8), poleMat);
    pole.position.set(0, 1.5, 0);
    pole.castShadow = true;
    scene.add(pole);
    this.objects.push(pole);
    // Physics body for pole (thin cylinder hitbox)
    const pBody = new CANNON.Body({ mass: 0 });
    pBody.addShape(new CANNON.Cylinder(0.08, 0.1, 3, 6));
    pBody.position.set(0, 1.5, 0);
    world.addBody(pBody);

    // Flag cloth
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

    // Glow ring at base
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
