import * as THREE from 'three';

/**
 * Creates a gradient sky background.
 *
 * If 6 cube faces are found in `public/skybox/` (px.jpg, nx.jpg, py.jpg, ny.jpg, pz.jpg, nz.jpg)
 * they will be used. Otherwise a fallback procedural gradient is generated.
 */
export function createSky(scene: THREE.Scene): void {
  const loader = new THREE.CubeTextureLoader();
  // Attempt to load a real skybox; on 404 we silently fall back to the gradient.
  loader.setPath('/skybox/');

  const urls = [
    'px.jpg', 'nx.jpg',
    'py.jpg', 'ny.jpg',
    'pz.jpg', 'nz.jpg',
  ];

  loader.load(
    urls,
    (texture) => {
      scene.background = texture;
    },
    undefined,
    () => {
      // Load failed — use procedural gradient
      scene.background = createGradientTexture();
    },
  );
}

/**
 * Generate a canvas-based vertical gradient from deep blue → warm horizon.
 */
function createGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0.0, '#0a0a2e');   // deep night sky top
  gradient.addColorStop(0.4, '#1a1a4e');   // mid blue
  gradient.addColorStop(0.7, '#4a6a8a');   // lighter near horizon
  gradient.addColorStop(0.85, '#8a9a7a');  // warm haze
  gradient.addColorStop(1.0, '#b0a080');   // sandy horizon

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}
