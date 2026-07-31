import * as THREE from 'three';

/**
 * Creates and configures the Three.js Scene.
 */
export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111122);
  return scene;
}
