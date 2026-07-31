import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Sets up an EffectComposer with SSAO and Bloom passes.
 *
 * Note: three@0.185.1 does not yet expose the new RenderPipeline API
 * for user-facing post-processing, so this uses the proven EffectComposer.
 *
 * @returns The composer (render with this instead of renderer.render)
 */
export function createPostProcessing(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): EffectComposer {
  const size = renderer.getSize(new THREE.Vector2());

  const composer = new EffectComposer(renderer);

  // 1. Main render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. SSAO — ground shadows to anchor objects
  const ssaoPass = new SSAOPass(scene, camera);
  ssaoPass.kernelRadius = 0.5;
  ssaoPass.minDistance = 0.005;
  ssaoPass.maxDistance = 0.05;
  composer.addPass(ssaoPass);

  // 3. Bloom — subtle glow for explosions / shell emissive
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.width, size.height),
    0.25,  // strength — subtle
    0.4,   // radius
    0.15,  // threshold — only bright things bloom
  );
  composer.addPass(bloomPass);

  // 4. Output — handles tone-mapping / color-space
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return composer;
}

/** Call on window resize to keep composer + passes in sync. */
export function resizeComposer(
  composer: EffectComposer,
  renderer: THREE.WebGLRenderer,
): void {
  const size = renderer.getSize(new THREE.Vector2());
  composer.setSize(size.width, size.height);
}
