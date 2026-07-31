import * as THREE from 'three';
import * as CANNON from 'cannon-es';

import { Block } from './components/Block';
import { Consumable } from './components/Consumable';
import type { ConsumableKind } from './components/Consumable';
import { createGround } from './components/Ground';
import { updateParticles } from './components/Explosion';
import { Tank } from './components/Tank';
import { generateFortress } from './components/TowerGenerator';
import { TIGER_I, KV_1, SHERMAN, T34_85, SU_152, BOB_SEMPLE } from './data/tankConfigs';
import type { TankConfig } from './data/tankConfigs';
import { createPhysicsWorld } from './physics/world';
import { createCamera } from './systems/Camera';
import { TankControls } from './systems/Controls';
import { FollowCamera } from './systems/FollowCamera';
import { HUD } from './systems/HUD';
import type { AimInfo } from './systems/HUD';
import { createLights } from './systems/Lighting';
import { MapGenerator } from './systems/MapGenerator';
import { createPostProcessing, resizeComposer } from './systems/PostProcessing';
import { createRenderer } from './systems/Renderer';
import { createScene } from './systems/Scene';
import { createSky } from './systems/Skybox';
import { setupResizeHandler } from './utils/resize';

// ── Bootstrap ──────────────────────────────────────────────
const scene = createScene();
createSky(scene);
const camera = createCamera();
const renderer = createRenderer();
const physicsWorld = createPhysicsWorld();

createLights(scene);
createGround(scene, physicsWorld);

// ── Map features (hills, bases, flag) ──────────────────────
new MapGenerator(scene, physicsWorld);

const hud = new HUD();

const composer = createPostProcessing(scene, camera, renderer);
setupResizeHandler(camera, renderer);
window.addEventListener('resize', () => resizeComposer(composer, renderer));

// ── Tank selection ─────────────────────────────────────────
let playerConfig: TankConfig;
let enemyConfig: TankConfig;
let playerTank: Tank;
let enemyTank: Tank;
let controls: TankControls;
let followCam: FollowCamera;
let blocks: Block[];
let aimables: (Tank | Block)[];
let respawnTimer = -1;

const TANK_POOL: TankConfig[] = [TIGER_I, KV_1, SHERMAN, T34_85, SU_152, BOB_SEMPLE];

/** Spawn a new random enemy tank (different from the player's) at the enemy base. */
function spawnEnemy(): void {
  const options = TANK_POOL.filter((c) => c.id !== playerConfig.id);
  enemyConfig = options[Math.floor(Math.random() * options.length)];
  enemyTank = new Tank(scene, physicsWorld, enemyConfig, 0, -40);
  enemyTank.body.position.y = 15; // drop in from above, land safely
  if (aimables) aimables[0] = enemyTank;
}

function startGame(choice: 'tiger' | 'kv1' | 'sherman' | 't34' | 'su152' | 'bobsemple') {
  // Choose player + enemy from the 6-tank pool (enemy is a different tank)
  const pool: Record<string, TankConfig> = {
    tiger: TIGER_I,
    kv1: KV_1,
    sherman: SHERMAN,
    t34: T34_85,
    su152: SU_152,
    bobsemple: BOB_SEMPLE,
  };
  playerConfig = pool[choice];

  // Tanks at their bases
  playerTank = new Tank(scene, physicsWorld, playerConfig, 0, 40);
  playerTank.body.position.y = 15;
  spawnEnemy();

  controls = new TankControls(renderer.domElement);
  controls.bind(playerTank, scene, physicsWorld);
  TankControls.setupBody(playerTank.body);
  controls.onShellFired = () => hud.incrementShells();
  controls.onShellSwitch = (shell) => hud.setShell(shell.name, controls.currentShellIndex);
  controls.onZoom = (dir) => {
    followCam.distance = Math.max(6, Math.min(30, followCam.distance - dir * 2));
    followCam.height = Math.max(4, Math.min(20, followCam.height - dir * 1.2));
  };

  followCam = new FollowCamera(camera, { distance: 14, height: 10 });

  // Initial shell indicator
  hud.setShell(playerConfig.shells[0].name, 0);

  // Small destructible wall near flag (not the massive fortress)
  blocks = generateFortress(scene, physicsWorld, -28, 0);
  aimables = [enemyTank, ...blocks];

  document.getElementById('hud-selector')?.classList.add('hidden');
  animate();
}

document.querySelectorAll('.sel-card').forEach((card) => {
  card.addEventListener('click', () => {
    const tank = card.getAttribute('data-tank');
    if (tank === 'tiger' || tank === 'kv1' || tank === 'sherman' || tank === 't34' ||
        tank === 'su152' || tank === 'bobsemple') {
      startGame(tank);
    }
  });
});

// ── Raycaster for aim info ─────────────────────────────────
const raycaster = new THREE.Raycaster();

function findAimTarget(obj: THREE.Object3D): Tank | Block | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    for (const target of aimables) {
      if (target instanceof Tank && cur === target.group) return target;
      if (target instanceof Block && cur === target.mesh) return target;
    }
    cur = cur.parent;
  }
  for (const b of blocks ?? []) { if (obj === b.mesh) return b; }
  return null;
}

// ── Animation loop ─────────────────────────────────────────
const clock = new THREE.Clock();
let SPEED = 10;
const TURN_SPEED = 2;
let speedBoostTimer = 0;

// ── Consumables ───────────────────────────────────────────
const consumables: Consumable[] = [];
let consumableSpawnTimer = 0;
let elapsed = 0;

function spawnConsumable(): void {
  const kinds: ConsumableKind[] = ['reload', 'heal', 'speed'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  // Random position within the play area (avoid bases)
  const x = (Math.random() - 0.5) * 80;
  const z = (Math.random() - 0.5) * 80;
  const c = new Consumable(scene, physicsWorld, new THREE.Vector3(x, 0.5, z), kind);
  consumables.push(c);
}

function applyConsumable(c: Consumable): void {
  switch (c.kind) {
    case 'reload':
      hud.showMessage('⚡ AMMO! Reload ready');
      // Force reload to complete by advancing lastFireTime
      // (controls.lastFireTime is private; use a public helper below)
      controls.forceReloadReady();
      break;
    case 'heal':
      playerTank.hp = Math.min(playerTank.maxHp, playerTank.hp + playerTank.maxHp * 0.4);
      hud.showMessage('💊 REPAIR! +40% HP');
      break;
    case 'speed':
      speedBoostTimer = 5;
      hud.showMessage('⚡ SPEED! +60% for 5s');
      break;
  }
  c.destroy(scene, physicsWorld);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const fixedDt = 1 / 60;
  elapsed += fixedDt;

  // Speed boost effect
  if (speedBoostTimer > 0) speedBoostTimer -= fixedDt;
  const activeSpeed = SPEED * (speedBoostTimer > 0 ? 1.6 : 1);

  physicsWorld.step(fixedDt, delta, 3);

  controls.updateSniperAim(fixedDt);
  controls.updateTank(activeSpeed, TURN_SPEED, camera);
  // Barrel pitch: sniper aim in sniper mode, auto-aim in third-person
  const pitch = controls.sniperMode ? controls.sniperAimY : controls.autoBarrelPitch;
  playerTank.setBarrelPitch(pitch);
  playerTank.update();

  controls.updateShells(fixedDt);
  updateParticles(scene, fixedDt);

  // ── Consumables: spawn + pickup ───────────────────────
  consumableSpawnTimer -= fixedDt;
  if (consumableSpawnTimer <= 0 && consumables.length < 5) {
    spawnConsumable();
    consumableSpawnTimer = 12; // every ~12s, up to 5 on map
  }
  for (let i = consumables.length - 1; i >= 0; i--) {
    const c = consumables[i];
    c.update(fixedDt, elapsed);
    const dist = c.mesh.position.distanceTo(playerTank.group.position);
    if (dist < 2.2) {
      applyConsumable(c);
      consumables.splice(i, 1);
    }
  }

  // ── Block cleanup ─────────────────────────────────────
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    block.update();
    if (block.body.position.y < -10) {
      block.destroy(scene, physicsWorld);
      hud.incrementBlocks();
      if (block.body.position.distanceTo(playerTank.body.position) < 10) {
        followCam.triggerShake(0.1);
      }
    }
    if (!block.alive) {
      blocks.splice(i, 1);
      aimables.splice(aimables.indexOf(block), 1);
    }
  }

  // ── Aim info ──────────────────────────────────────────
  raycaster.setFromCamera(controls.mouseNDC, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const prevEnemyHp = enemyTank.hp;

  // ── Enemy turret tracks player ────────────────────────
  const toPlayer = new THREE.Vector3()
    .copy(playerTank.group.position).sub(enemyTank.group.position);
  toPlayer.y = 0;
  if (toPlayer.lengthSq() > 0.1) {
    toPlayer.normalize();
    const eFwd = new THREE.Vector3(0, 0, -1);
    eFwd.applyQuaternion(enemyTank.group.quaternion);
    const eAngle = Math.atan2(
      eFwd.x * toPlayer.z - eFwd.z * toPlayer.x,
      eFwd.x * toPlayer.x + eFwd.z * toPlayer.z,
    );
    if (enemyTank.isTD) {
      // TD: rotate the hull toward the player
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), Math.max(-0.02, Math.min(0.02, eAngle)),
      );
      enemyTank.group.quaternion.multiply(q);
      enemyTank.body.quaternion.copy(enemyTank.group.quaternion as unknown as CANNON.Quaternion);
    } else {
      enemyTank.setTurretRotation(-eAngle);
    }
  }

  if (enemyTank.hp < prevEnemyHp) {
    hud.showHitMarker();
    followCam.triggerShake(0.15);
    // Big shake + flash when the enemy is destroyed
    if (enemyTank.hp <= 0) {
      followCam.triggerShake(0.6);
    }
  }

  // ── Enemy respawn ─────────────────────────────────────
  if (!enemyTank.alive && respawnTimer < 0) {
    respawnTimer = 3.0; // give the explosion a moment
  } else if (respawnTimer >= 0) {
    respawnTimer -= fixedDt;
    if (respawnTimer <= 0) {
      respawnTimer = -1;
      spawnEnemy();
    }
  }

  let aimInfo: AimInfo | null = null;
  for (const hit of hits) {
    const target = findAimTarget(hit.object);
    if (!target) continue;

    const tankFwd = new THREE.Vector3(0, 0, -1);
    const quat = new THREE.Quaternion().copy(playerTank.group.quaternion);
    const tAngle = playerTank.turret.rotation.y;
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tAngle));
    tankFwd.applyQuaternion(quat);

    const normal = hit.face!.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);
    const cosAngle = Math.abs(tankFwd.dot(normal));
    const angleDeg = Math.acos(Math.min(cosAngle, 1)) * (180 / Math.PI);

    const armor = target instanceof Tank ? target.armor : target.armor;
    // HEAT ignores angle (flat armor); AP/HE use effective armor
    const shell = controls.currentShell;
    const effectiveArmor = shell.id === 'heat'
      ? armor
      : armor / Math.max(cosAngle, 0.05);
    const pen = shell.penetration;
    const penChance = pen / effectiveArmor;

    aimInfo = {
      name: target instanceof Tank ? target.name : 'WALL',
      armor, angleDeg, effectiveArmor, penetration: pen,
      willPen: penChance >= 1 || (shell.id === 'he') || angleDeg > 70,
      penChance: Math.min(1, penChance),
      autoRicochet: shell.id === 'ap' && angleDeg > 70,
      ricochetChance: Math.max(0, 1 - penChance),
    };
    break;
  }
  hud.updateAimInfo(aimInfo);

  followCam.mode = controls.sniperMode ? 'sniper' : 'third-person';
  followCam.update(playerTank, delta);

  // Scope overlay + hide crosshair in sniper mode
  hud.setSniperMode(controls.sniperMode);

  hud.updateTank(playerTank);
  hud.updateEnemyTank(enemyTank);
  hud.updateReload(controls.reloadProgress, controls.reloadProgress >= 1);
  hud.updateMessage(fixedDt);

  composer.render();
}
