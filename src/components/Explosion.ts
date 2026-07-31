import * as THREE from 'three';

const PARTICLE_COUNT = 24;
const PARTICLE_LIFETIME = 0.6;
const SPARK_COUNT = 12;
const SPARK_LIFETIME = 0.25;

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  lifetime: number;
}

const activeParticles: Particle[] = [];

/**
 * Spawn a burst of short-lived particles at a world position (explosion).
 */
export function spawnExplosion(scene: THREE.Scene, position: THREE.Vector3): void {
  const colors = [0xff6633, 0xffaa44, 0xff4400, 0xffff66];
  const geo = new THREE.SphereGeometry(0.08, 4, 4);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      emissive: 0xff4400,
      emissiveIntensity: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    scene.add(mesh);

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      Math.random() * 6 + 1,
      (Math.random() - 0.5) * 8,
    );

    activeParticles.push({ mesh, velocity, lifetime: PARTICLE_LIFETIME });
  }
}

/**
 * Spawn a small bright spark burst at a position (ricochet).
 */
export function spawnRicochetSpark(scene: THREE.Scene, position: THREE.Vector3): void {
  const geo = new THREE.SphereGeometry(0.04, 4, 4);
  for (let i = 0; i < SPARK_COUNT; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffcc,
      emissive: 0xffaa44,
      emissiveIntensity: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    scene.add(mesh);

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 5,
    );

    activeParticles.push({ mesh, velocity, lifetime: SPARK_LIFETIME });
  }
}

/**
 * Spawn a large spectacular explosion (tank destroyed).
 */
export function spawnBigExplosion(scene: THREE.Scene, position: THREE.Vector3): void {
  const colors = [0xff8844, 0xffaa22, 0xff4400, 0xffff66, 0xff6600];
  const geo = new THREE.SphereGeometry(0.12, 5, 5);

  for (let i = 0; i < 60; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      emissive: 0xff4400,
      emissiveIntensity: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    scene.add(mesh);

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 14,
      Math.random() * 10 + 2,
      (Math.random() - 0.5) * 14,
    );

    activeParticles.push({ mesh, velocity, lifetime: 1.0 });
  }

  // Fireball flash — a large bright sphere that expands and fades
  const flashGeo = new THREE.SphereGeometry(0.5, 8, 8);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffaa44,
    transparent: true,
    opacity: 0.9,
  });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.copy(position);
  scene.add(flash);

  const flashParticle: Particle = {
    mesh: flash,
    velocity: new THREE.Vector3(0, 0.5, 0),
    lifetime: 0.5,
  };
  activeParticles.push(flashParticle);
}

/**
 * Call each frame to animate and clean up active particles.
 */
export function updateParticles(scene: THREE.Scene, dt: number): void {
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    p.lifetime -= dt;

    if (p.lifetime <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
      activeParticles.splice(i, 1);
      continue;
    }

    p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
    p.velocity.y -= 9.82 * dt;

    // Fireball flash: expand rapidly and fade
    if ((p.mesh.userData as any).grow) {
      const grow = (p.mesh.userData as any).grow;
      p.mesh.scale.addScalar(grow * dt);
      (p.mesh.material as THREE.Material).opacity = Math.max(0, p.lifetime / 0.5);
      continue;
    }

    p.mesh.scale.setScalar(1 - (1 - p.lifetime / PARTICLE_LIFETIME) * 0.7);
  }
}
