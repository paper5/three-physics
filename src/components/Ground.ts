import * as CANNON from 'cannon-es';
import * as THREE from 'three';

const MAP_SIZE = 120;
const CELL = 12; // grid cell size in units

export function getTerrainHeight(x: number, z: number): number {
  const valley = -1.8 * Math.exp(-(z * z) / 600);
  const roll1 = 1.2 * Math.sin(x * 0.04 + 0.5) * Math.cos(z * 0.035 + 0.3);
  const roll2 = 0.9 * Math.sin(x * 0.07 + z * 0.05 + 1.2);
  const hillA = 1.8 * Math.exp(-((x - 25) * (x - 25) + (z - 18) * (z - 18)) / 160);
  const hillB = 1.5 * Math.exp(-((x + 30) * (x + 30) + (z + 22) * (z + 22)) / 140);
  const zNear = Math.abs(Math.abs(z) - 48);
  if (zNear < 10) {
    const blend = Math.max(0, (10 - zNear) / 10);
    const raw = valley + roll1 + roll2 + hillA + hillB;
    return raw * (1 - blend * 0.8);
  }
  return valley + roll1 + roll2 + hillA + hillB;
}

/**
 * Creates terrain.
 *
 * VISUAL: smooth height-mapped PlaneGeometry.
 * PHYSICS: a grid of static CANNON.Boxes (10×10, 12-unit cells) whose tops
 *          match the terrain height — stepped but reliable, plus a flat
 *          CANNON.Plane underneath as an absolute floor so nothing falls.
 */
export function createGround(scene: THREE.Scene, world: CANNON.World): void {
  const segs = 60;

  // ── Visual height-mapped terrain ──────────────────────
  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position.array as Float32Array;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i + 1] = getTerrainHeight(pos[i], pos[i + 2]);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a6b2a, roughness: 0.9, metalness: 0.0, flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // ── Flat plane — absolute guaranteed floor ─────────────
  const floor = new CANNON.Body({ mass: 0 });
  floor.addShape(new CANNON.Plane());
  floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floor);

  // ── Grid of static boxes matching terrain heights ─────
  const cells = MAP_SIZE / CELL; // 10
  const half = MAP_SIZE / 2;

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const cx = -half + i * CELL + CELL / 2;
      const cz = -half + j * CELL + CELL / 2;
      // Sample terrain height at 4 corners + center, take the max
      const hc = getTerrainHeight(cx, cz);
      const h00 = getTerrainHeight(cx - CELL / 2, cz - CELL / 2);
      const h10 = getTerrainHeight(cx + CELL / 2, cz - CELL / 2);
      const h01 = getTerrainHeight(cx - CELL / 2, cz + CELL / 2);
      const h11 = getTerrainHeight(cx + CELL / 2, cz + CELL / 2);
      const h = Math.max(hc, h00, h10, h01, h11);

      // Only add a block where the terrain rises above the flat floor
      if (h <= 0.05) continue;

      const boxH = Math.max(h, 0.2);
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(CELL / 2, boxH / 2, CELL / 2)));
      body.position.set(cx, boxH / 2, cz);
      world.addBody(body);
    }
  }

  // ── Wireframe grid overlay ────────────────────────────
  const gridGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segs, segs);
  gridGeo.rotateX(-Math.PI / 2);
  const gpos = gridGeo.attributes.position.array as Float32Array;
  for (let i = 0; i < gpos.length; i += 3) {
    gpos[i + 1] = getTerrainHeight(gpos[i], gpos[i + 2]) + 0.02;
  }
  const gridMat = new THREE.MeshBasicMaterial({
    color: 0x447744, wireframe: true, transparent: true, opacity: 0.15,
  });
  scene.add(new THREE.Mesh(gridGeo, gridMat));
}
