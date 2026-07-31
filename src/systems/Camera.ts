import * as THREE from 'three';

/**
 * Creates a perspective camera with sensible defaults.
 */
export function createCamera(): THREE.PerspectiveCamera {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  camera.position.set(5, 5, 10);
  camera.lookAt(0, 0, 0);
  return camera;
}
