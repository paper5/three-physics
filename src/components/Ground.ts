import * as CANNON from 'cannon-es';
import * as THREE from 'three';

const MAP_SIZE = 240;

/** Static rock physics bodies — used for enemy obstacle avoidance. */
export const rockBodies: CANNON.Body[] = [];
/** Rock meshes — used for distance culling. */
export const rockMeshes: THREE.Mesh[] = [];

/**
 * Flat terrain with scattered rock obstacles.
 *
 * Physics is a simple CANNON.Plane (always works — nothing falls through),
 * plus static box bodies for the rocks.
 */
export function getTerrainHeight(x: number, z: number): number {
  // Flat terrain — height is always 0
  void x; void z;
  return 0;
}

export function createGround(scene: THREE.Scene, world: CANNON.World): void {
  const size = MAP_SIZE;

  // ── Flat visual ground ────────────────────────────────
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a6b2a,
    roughness: 0.95,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Grid overlay
  const grid = new THREE.GridHelper(size, size, 0x88aa88, 0x446644);
  grid.position.y = 0.02;
  scene.add(grid);

  // ── Flat physics ground — guaranteed collision ────────
  const ground = new CANNON.Body({ mass: 0 });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(ground);

  // ── Rocks (visual + physics) ──────────────────────────
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x5a4a3a, roughness: 0.95, metalness: 0.0,
  });

  // [x, z, width, height, depth]
  const rocks: [number, number, number, number, number][] = [
    // Central cluster
    [-25, -18, 5, 1.5, 4], [30, -15, 4, 1.0, 3], [-35, 12, 3.5, 0.8, 2.5],
    [28, 20, 6, 1.8, 4], [-12, -35, 4, 0.9, 3], [18, -32, 3, 0.7, 2],
    [-8, 0, 2.5, 0.5, 2], [8, -8, 2, 0.4, 1.5], [-20, -10, 3.5, 0.7, 2.5],
    [15, 10, 4, 0.9, 3], [0, -25, 3, 0.6, 2], [-30, 30, 3.5, 0.8, 2.5],
    [35, -30, 3, 0.5, 2], [-5, 20, 2.5, 0.5, 2], [20, 5, 3, 0.7, 2.5],
    // Wide ring of rocks across the big map
    [-70, -80, 5, 1.4, 4], [55, -95, 4, 1.0, 3], [-90, 40, 3.5, 0.8, 2.5],
    [85, 60, 6, 1.8, 4], [-50, -110, 4, 0.9, 3], [60, -60, 3, 0.7, 2],
    [-105, -30, 5, 1.2, 3.5], [100, -20, 4.5, 1.1, 3], [-75, 85, 4, 0.8, 3],
    [40, 100, 3, 0.6, 2], [-15, -90, 2.5, 0.5, 2], [75, 30, 3, 0.7, 2.5],
    [-60, 60, 3.5, 0.8, 2.5], [95, -75, 3, 0.5, 2], [-95, -70, 2.5, 0.5, 2],
    [50, 50, 3, 0.7, 2.5], [-40, 95, 2, 0.4, 1.5], [25, -70, 4, 1.0, 3],
    [-80, -5, 3, 0.6, 2], [10, 75, 3.5, 0.8, 2.5], [-110, 60, 2, 0.4, 1.5],
    [65, -35, 2.5, 0.5, 2], [-25, 110, 3, 0.7, 2], [90, 85, 2, 0.4, 1.5],
  ];

  for (const [x, z, w, h, d] of rocks) {
    const rock = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rockMat);
    rock.position.set(x, h / 2, z);
    rock.rotation.y = Math.random() * Math.PI;
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    rockMeshes.push(rock);

    const rockBody = new CANNON.Body({ mass: 0 });
    rockBody.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    rockBody.position.set(x, h / 2, z);
    world.addBody(rockBody);
    rockBodies.push(rockBody);
  }
}
