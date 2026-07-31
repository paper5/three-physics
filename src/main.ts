import * as THREE from 'three';
import * as CANNON from 'cannon-es';

import { Block } from './components/Block';
import { Consumable } from './components/Consumable';
import type { ConsumableKind } from './components/Consumable';
import { createGround, rockBodies } from './components/Ground';
import { updateParticles } from './components/Explosion';
import { Shell } from './components/Shell';
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
  TankControls.setupBody(enemyTank.body);
  if (aimables) aimables[0] = enemyTank;
  enemyReloadTimer = 3;
}

/** Slowly rotate the enemy hull toward an absolute XZ angle. */
function turnEnemyHull(targetAngle: number, dt: number): void {
  const body = enemyTank.body;
  const fwd = new CANNON.Vec3(0, 0, -1);
  body.quaternion.vmult(fwd, fwd);
  const current = Math.atan2(fwd.x, fwd.z);
  let diff = targetAngle - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = 1.5 * dt;
  const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
  const q = new CANNON.Quaternion();
  q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), turn);
  body.quaternion = q.mult(body.quaternion);
  body.quaternion.normalize();
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
const BASE_SPEED = 10;
const clock = new THREE.Clock();
let SPEED = BASE_SPEED;
const TURN_SPEED = 2;
let speedBoostTimer = 0;
let enemiesDestroyed = 0;
let enemyReloadTimer = 4;
let gameOver = false;
const enemyShells: Shell[] = [];

// ── Upgrade system ─────────────────────────────────────────
const UPGRADES: { id: string; name: string; desc: string; max: number }[] = [
  { id: 'damage', name: 'Damage', desc: '+15% shell damage', max: 5 },
  { id: 'reload', name: 'Reload', desc: '-10% reload time', max: 5 },
  { id: 'armor', name: 'Armor', desc: '+10 hull armor', max: 5 },
  { id: 'speed', name: 'Speed', desc: '+10% movement', max: 5 },
  { id: 'hp', name: 'Hull HP', desc: '+100 max HP', max: 5 },
];
const upgradeLevels: Record<string, number> = {};
let upgradePoints = 0;
let upgradePanelOpen = false;

function applyUpgrade(id: string): void {
  const lvl = upgradeLevels[id] ?? 1;
  switch (id) {
    case 'damage':
      playerTank.damageMult = 1 + 0.15 * lvl;
      break;
    case 'reload':
      controls.setReloadMult(Math.max(0.5, 1 - 0.1 * lvl));
      break;
    case 'armor':
      playerTank.armor = playerTank.baseArmor + 10 * lvl;
      break;
    case 'speed':
      SPEED = BASE_SPEED * (1 + 0.1 * lvl);
      break;
    case 'hp':
      playerTank.maxHp += 100;
      playerTank.hp = Math.min(playerTank.maxHp, playerTank.hp + 100);
      break;
  }
  hud.refreshUpgrades(upgradePoints, UPGRADES, upgradeLevels);
}

function buyUpgrade(id: string): void {
  const def = UPGRADES.find((u) => u.id === id)!;
  const lvl = upgradeLevels[id] ?? 0;
  if (lvl >= def.max || upgradePoints < 1) return;
  upgradePoints--;
  upgradeLevels[id] = lvl + 1;
  applyUpgrade(id);
  hud.showMessage(`🔧 ${def.name} upgraded!`);
}

function refreshUpgradePanel(): void {
  hud.refreshUpgrades(upgradePoints, UPGRADES, upgradeLevels);
}

// Toggle the upgrade panel with 'P'
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'p') {
    upgradePanelOpen = !upgradePanelOpen;
    hud.setUpgradePanelVisible(upgradePanelOpen);
    if (upgradePanelOpen) refreshUpgradePanel();
  }
});
// Buy buttons
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-upg]') as HTMLButtonElement | null;
  if (btn) buyUpgrade(btn.getAttribute('data-upg')!);
});

// ── Kill tracking — fires directly from Tank.dispose (bulletproof) ──
Tank.onTankDestroyed = (tank) => {
  if (gameOver) return;
  if (tank === enemyTank) {
    enemiesDestroyed++;
    hud.incrementKills();
    upgradePoints++;
    hud.showMessage(`💀 Enemy destroyed! +1 upgrade point (P)`);
  }
};

// ── Third-person aim marker ────────────────────────────────
const aimMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.55, 24),
  new THREE.MeshBasicMaterial({
    color: 0xff6644,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  }),
);
aimMarker.rotation.x = -Math.PI / 2;
aimMarker.position.y = 0.05;
aimMarker.visible = false;
scene.add(aimMarker);

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

  // Capture enemy HP BEFORE the physics step — collide events fire inside step()
  const prevEnemyHp = enemyTank.hp;

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
  enemyTank.update(); // sync enemy body → mesh so it moves and is hittable

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

  // ── Enemy movement AI + turret tracking ───────────────
  const toPlayer = new THREE.Vector3()
    .copy(playerTank.group.position).sub(enemyTank.group.position);
  toPlayer.y = 0;
  const distToPlayer = toPlayer.length();
  if (distToPlayer > 0.1) {
    toPlayer.normalize();
    const eFwd = new THREE.Vector3(0, 0, -1);
    eFwd.applyQuaternion(enemyTank.group.quaternion);
    const eAngle = Math.atan2(
      eFwd.x * toPlayer.z - eFwd.z * toPlayer.x,
      eFwd.x * toPlayer.x + eFwd.z * toPlayer.z,
    );
    if (!enemyTank.isTD) {
      enemyTank.setTurretRotation(-eAngle);
    }
  }

  // ── Enemy drives around (velocity-based so physics keeps it grounded) ──
  if (enemyTank.alive && !gameOver) {
    const body = enemyTank.body;
    const dx = playerTank.group.position.x - body.position.x;
    const dz = playerTank.group.position.z - body.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Movement decision: approach when far, strafe mid-range, back off when close
    let moveX: number, moveZ: number;
    if (dist > 25) {
      moveX = dx / dist; moveZ = dz / dist;      // chase
    } else if (dist < 12) {
      moveX = -dx / dist; moveZ = -dz / dist;    // back off
    } else {
      moveX = -dz / dist; moveZ = dx / dist;     // strafe around
    }

    const enemySpeed = 5;
    // Obstacle avoidance: steer around rocks ahead of the movement direction
    let steerX = moveX, steerZ = moveZ;
    const lookAhead = 4;
    const probeX = body.position.x + moveX * lookAhead;
    const probeZ = body.position.z + moveZ * lookAhead;
    for (const rock of rockBodies) {
      const rx = probeX - rock.position.x;
      const rz = probeZ - rock.position.z;
      const rockR = 3;
      if (rx * rx + rz * rz < rockR * rockR) {
        // Steer perpendicular to avoid the rock
        steerX = -moveZ;
        steerZ = moveX;
        break;
      }
    }

    // Set velocity (not position) so the solver maintains ground contact
    body.velocity.x = steerX * enemySpeed;
    body.velocity.z = steerZ * enemySpeed;
    // Safety: never let the body sink below ground level
    if (body.position.y < enemyTank.config.hullDimensions[1] / 2) {
      body.position.y = enemyTank.config.hullDimensions[1] / 2;
    }

    // Hull faces movement direction; TDs face the player to aim
    const faceX = enemyTank.isTD ? dx : steerX;
    const faceZ = enemyTank.isTD ? dz : steerZ;
    turnEnemyHull(Math.atan2(faceX, faceZ), fixedDt);
  }

  if (enemyTank.hp < prevEnemyHp) {
    hud.showHitMarker();
    followCam.triggerShake(0.15);
  }
  // Kill tracking is handled via Tank.onTankDestroyed callback (above)

  // ── Enemy AI: fire at the player ──────────────────────
  if (enemyTank.alive && !gameOver) {
    enemyReloadTimer -= fixedDt;
    if (enemyReloadTimer <= 0) {
      const shellDef = enemyConfig.shells[0];

      // Aim at the LEAD position (where the player will be when the shell arrives)
      const body = enemyTank.body;
      const tip = new THREE.Vector3();
      enemyTank.barrelTip.getWorldPosition(tip);
      const pPos = playerTank.group.position;
      const pVel = playerTank.body.velocity;
      const ddx = pPos.x - tip.x;
      const ddz = pPos.z - tip.z;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);
      const flight = dist / Math.max(shellDef.muzzleSpeed, 1);
      const leadX = pPos.x + pVel.x * flight;
      const leadZ = pPos.z + pVel.z * flight;

      // Point the turret/hull at the lead position
      const aimX = leadX - body.position.x;
      const aimZ = leadZ - body.position.z;
      const aimDist = Math.sqrt(aimX * aimX + aimZ * aimZ);
      if (aimDist > 0.5) {
        turnEnemyHull(Math.atan2(aimX, aimZ), 10 * fixedDt); // snap quickly
        if (!enemyTank.isTD) {
          const eFwd = new CANNON.Vec3(0, 0, -1);
          body.quaternion.vmult(eFwd, eFwd);
          const eAngle = Math.atan2(
            eFwd.x * aimZ - eFwd.z * aimX,
            eFwd.x * aimX + eFwd.z * aimZ,
          );
          enemyTank.setTurretRotation(-eAngle);
        }
      }

      // Ballistic barrel pitch to compensate for shell drop
      const drop = (9.82 * aimDist * aimDist) / (2 * shellDef.muzzleSpeed * shellDef.muzzleSpeed);
      const pitch = Math.atan2((pPos.y - tip.y) + drop, aimDist);
      enemyTank.setBarrelPitch(pitch);

      // Fire
      const shell = Shell.fire(scene, physicsWorld, enemyTank, shellDef);
      enemyShells.push(shell);
      enemyReloadTimer = enemyConfig.reloadTime + Math.random() * 2;
    }
  }

  // ── Update enemy shells (sync + cleanup) ──────────────
  for (let i = enemyShells.length - 1; i >= 0; i--) {
    const s = enemyShells[i];
    s.update(fixedDt);
    if (s.body.position.y < -5 || s.body.position.length() > 100) {
      s.destroy();
    }
    if (!s.alive) {
      enemyShells.splice(i, 1);
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

  // ── Third-person aim marker (ground aim point) ────────
  if (!controls.sniperMode && !gameOver) {
    const aimPoint = controls.getIntersection(camera);
    if (aimPoint) {
      aimMarker.position.set(aimPoint.x, 0.05, aimPoint.z);
      aimMarker.visible = true;
    } else {
      aimMarker.visible = false;
    }
  } else {
    aimMarker.visible = false;
  }

  followCam.mode = controls.sniperMode ? 'sniper' : 'third-person';
  followCam.update(playerTank, delta);

  // Scope overlay + hide crosshair in sniper mode
  hud.setSniperMode(controls.sniperMode);

  hud.updateTank(playerTank);
  hud.updateEnemyTank(enemyTank);
  hud.updateReload(controls.reloadProgress, controls.reloadProgress >= 1);
  hud.updateMessage(fixedDt);

  // ── Game over check ──────────────────────────────────
  if (!gameOver && (!playerTank.alive || playerTank.hp <= 0)) {
    gameOver = true;
    hud.showGameOver(enemiesDestroyed);
    followCam.triggerShake(0.8);
  }

  // ── Minimap ──────────────────────────────────────────
  if (!gameOver) {
    const pPos = playerTank.group.position;
    const ePos = enemyTank.alive ? enemyTank.group.position : null;
    const pAngle = Math.atan2(pPos.x, pPos.z);
    const eAngle = ePos ? Math.atan2(ePos.x, ePos.z) : 0;
    hud.drawMinimap(
      { x: pPos.x, z: pPos.z, angle: pAngle },
      ePos ? { x: ePos.x, z: ePos.z, angle: eAngle } : null,
      { x: 0, z: 0 },
      consumables.map((c) => ({
        x: c.mesh.position.x,
        z: c.mesh.position.z,
        color: c.kind === 'reload' ? '#33cc44' : c.kind === 'heal' ? '#ff4466' : '#4488ff',
      })),
      blocks.map((b) => ({ x: b.body.position.x, z: b.body.position.z })),
    );
  }

  composer.render();
}
