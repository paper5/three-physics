import * as CANNON from 'cannon-es';

/**
 * Creates and configures a Cannon-es physics world with Earth gravity.
 */
export function createPhysicsWorld(): CANNON.World {
  const world = new CANNON.World();

  // Earth gravity: -9.82 m/s² on Y-axis
  world.gravity.set(0, -9.82, 0);

  // Allow bodies to sleep when at rest (performance optimisation)
  world.allowSleep = true;

  // Default contact material
  const defaultMaterial = new CANNON.Material('default');
  world.defaultContactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
    friction: 0.3,
    restitution: 0.3,
  });

  return world;
}
