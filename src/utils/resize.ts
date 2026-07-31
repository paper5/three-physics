import * as THREE from 'three';

/**
 * Sets up a window resize listener that updates the camera aspect ratio
 * and renderer size.
 */
export function setupResizeHandler(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): () => void {
  const onResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  };

  window.addEventListener('resize', onResize);

  // Return a cleanup function
  return () => window.removeEventListener('resize', onResize);
}
