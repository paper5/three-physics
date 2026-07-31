import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Creates a large green grid ground plane with a matching static physics body.
 */
export function createGround(scene: THREE.Scene, world: CANNON.World): void {
  const size = 120;
  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.MeshStandardMaterial({
    color: 0x2d5a27,
    roughness: 0.9,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const grid = new THREE.GridHelper(size, size, 0x88aa88, 0x446644);
  grid.position.y = 0.01;
  scene.add(grid);

  const shape = new CANNON.Plane();
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(body);
}
