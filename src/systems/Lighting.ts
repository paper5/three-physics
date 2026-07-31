import * as THREE from 'three';

/**
 * Adds ambient light and a directional light (with shadows) to the scene.
 */
export function createLights(scene: THREE.Scene): { ambient: THREE.AmbientLight; directional: THREE.DirectionalLight } {
  // Soft ambient light
  const ambient = new THREE.AmbientLight(0x404060);
  scene.add(ambient);

  // Directional light with shadows
  const directional = new THREE.DirectionalLight(0xffffff, 1.2);
  directional.position.set(10, 15, 10);
  directional.castShadow = true;

  // Shadow map settings
  directional.shadow.mapSize.width = 2048;
  directional.shadow.mapSize.height = 2048;
  directional.shadow.camera.near = 0.5;
  directional.shadow.camera.far = 40;
  directional.shadow.camera.left = -15;
  directional.shadow.camera.right = 15;
  directional.shadow.camera.top = 15;
  directional.shadow.camera.bottom = -15;

  scene.add(directional);

  // Optional: helper to visualise the light frustum (remove in production)
  // scene.add(new THREE.CameraHelper(directional.shadow.camera));

  return { ambient, directional };
}
