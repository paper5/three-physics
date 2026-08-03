import * as THREE from 'three';
import * as CANNON from 'cannon-es';

import { Block } from './components/Block';
import { Consumable } from './components/Consumable';
import type { ConsumableKind } from './components/Consumable';
import { createGround, rockBodies, rockMeshes } from './components/Ground';
import { updateParticles } from './components/Explosion';
import { Shell } from './components/Shell';
import { Tank } from './components/Tank';
import { generateFortress } from './components/TowerGenerator';
import { TIGER_I, KV_1, SHERMAN, T34_85, SU_152, BOB_SEMPLE, PZ4, STUART, T34_STARTER, PERSHING, TIGER2 } from './data/tankConfigs';
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
new MapGenerator(scene, physicsWorld);

const hud = new HUD();

const composer = createPostProcessing(scene, camera, renderer);
setupResizeHandler(camera, renderer);
window.addEventListener('resize', () => resizeComposer(composer, renderer));

// ── Tank selection + evolution ─────────────────────────────
let playerConfig: TankConfig;
let playerTank: Tank;
let controls: TankControls;
let followCam: FollowCamera;
let blocks: Block[];
let aimables: (Tank | Block)[];
let playerNation: 'germany' | 'usa' | 'ussr' = 'germany';
let currentTier = 0;
let enemyCount = 2;

interface EnemyState {
  tank: Tank;
  config: TankConfig;
  reloadTimer: number;
  respawnTimer: number;
  prevHp: number;
  slot: number;
}
let enemies: EnemyState[] = [];

const TANK_POOL: TankConfig[] = [
  TIGER_I, KV_1, SHERMAN, T34_85, SU_152, BOB_SEMPLE, PZ4, STUART, T34_STARTER, PERSHING, TIGER2,
];
const TANK_BY_ID: Record<string, TankConfig> = {};
for (const t of TANK_POOL) TANK_BY_ID[t.id] = t;

const EVOLUTION_CHAINS: Record<string, { id: string; name: string; cost: number }[]> = {
  germany: [
    { id: 'pz4', name: 'Panzer IV', cost: 0 },
    { id: 'tiger', name: 'Tiger I', cost: 3 },
    { id: 'tiger2', name: 'Tiger II', cost: 5 },
    { id: 'bobsemple', name: 'Bob Semple 🤡', cost: 8 },
  ],
  usa: [
    { id: 'stuart', name: 'M3 Stuart', cost: 0 },
    { id: 'sherman', name: 'M4A3E8 Sherman', cost: 3 },
    { id: 'pershing', name: 'M26 Pershing', cost: 5 },
    { id: 'bobsemple', name: 'Bob Semple 🤡', cost: 8 },
  ],
  ussr: [
    { id: 't34early', name: 'T-34', cost: 0 },
    { id: 't34', name: 'T-34/85', cost: 3 },
    { id: 'su152', name: 'SU-152', cost: 6 },
    { id: 'bobsemple', name: 'Bob Semple 🤡', cost: 10 },
  ],
};

/** Spawn an enemy at a spread position across the enemy side. */
function spawnEnemy(e: EnemyState): void {
  const options = TANK_POOL.filter((c) => c.id !== playerConfig.id);
  e.config = options[Math.floor(Math.random() * options.length)];
  const x = (e.slot - (enemyCount - 1) / 2) * 22;
  const z = -90;
  e.tank = new Tank(scene, physicsWorld, e.config, x, z);
  e.tank.body.position.y = 15;
  TankControls.setupBody(e.tank.body);
  e.reloadTimer = 2 + Math.random() * 3;
  e.respawnTimer = -1;
  e.prevHp = e.tank.hp;
  createLabel(e.tank);
}

function initEnemies(): void {
  for (const e of enemies) {
    if (e.tank.alive) e.tank.dispose(scene, physicsWorld);
    removeLabel(e.tank);
  }
  enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    const e: EnemyState = {
      tank: null as unknown as Tank,
      config: TIGER_I,
      reloadTimer: 2,
      respawnTimer: -1,
      prevHp: 1000,
      slot: i,
    };
    enemies.push(e);
    spawnEnemy(e);
  }
  aimables = [...enemies.map((e) => e.tank), ...blocks];
}

/** Slowly rotate a tank's hull toward an absolute XZ angle. */
function turnHull(body: CANNON.Body, targetAngle: number, dt: number, speed = 1.5): void {
  const fwd = new CANNON.Vec3(0, 0, -1);
  body.quaternion.vmult(fwd, fwd);
  const current = Math.atan2(fwd.x, fwd.z);
  let diff = targetAngle - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = speed * dt;
  const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
  const q = new CANNON.Quaternion();
  q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), turn);
  body.quaternion = q.mult(body.quaternion);
  body.quaternion.normalize();
}

function startGame(nation: 'germany' | 'usa' | 'ussr') {
  playerNation = nation;
  currentTier = 0;
  playerConfig = TANK_BY_ID[EVOLUTION_CHAINS[nation][0].id];

  playerTank = new Tank(scene, physicsWorld, playerConfig, 0, 95);
  playerTank.body.position.y = 15;

  blocks = generateFortress(scene, physicsWorld, -60, 0);
  aimables = [];
  initEnemies();

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

  hud.setShell(playerConfig.shells[0].name, 0);
  createLabel(playerTank);

  document.getElementById('hud-selector')?.classList.add('hidden');
  animate();
}

document.querySelectorAll('.sel-card').forEach((card) => {
  card.addEventListener('click', () => {
    const nation = card.getAttribute('data-nation');
    if (nation === 'germany' || nation === 'usa' || nation === 'ussr') {
      startGame(nation);
    }
  });
});
// Enemy count selector
document.querySelectorAll('.sel-count').forEach((btn) => {
  btn.addEventListener('click', () => {
    enemyCount = Number(btn.getAttribute('data-count'));
    document.querySelectorAll('.sel-count').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ── Name labels + per-tank health bars ─────────────────────
const nameLabels = new Map<Tank, HTMLElement>();
function createLabel(tank: Tank): void {
  const el = document.createElement('div');
  el.className = 'tank-label';
  el.innerHTML = `
    <div class="tank-label-name"></div>
    <div class="tank-label-hp"><div class="tank-label-hp-fill"></div></div>
  `;
  document.body.appendChild(el);
  nameLabels.set(tank, el);
}
function removeLabel(tank: Tank): void {
  const el = nameLabels.get(tank);
  if (el) { el.remove(); nameLabels.delete(tank); }
}
function updateLabel(tank: Tank): void {
  const el = nameLabels.get(tank);
  if (!el) return;
  if (!tank.alive || gameOver) { el.style.display = 'none'; return; }
  const v = new THREE.Vector3();
  tank.group.getWorldPosition(v);
  v.y += tank.config.hullDimensions[1] + 1.4;
  v.project(camera);
  if (v.z > 1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;

  // Name + HP bar
  const nameEl = el.querySelector('.tank-label-name') as HTMLElement;
  nameEl.textContent = tank.name;
  nameEl.style.color = tank === playerTank ? '#8cf' : '#f88';
  const ratio = Math.max(0, tank.hp / tank.maxHp);
  const fill = el.querySelector('.tank-label-hp-fill') as HTMLElement;
  fill.style.width = `${ratio * 100}%`;
  const r = Math.min(1, (1 - ratio) * 2);
  const g = Math.min(1, ratio * 2);
  fill.style.backgroundColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, 50)`;
}

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
    case 'damage': playerTank.damageMult = 1 + 0.15 * lvl; break;
    case 'reload': controls.setReloadMult(Math.max(0.5, 1 - 0.1 * lvl)); break;
    case 'armor': playerTank.armor = playerTank.baseArmor + 10 * lvl; break;
    case 'speed': SPEED = BASE_SPEED * (1 + 0.1 * lvl); break;
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
  const chain = EVOLUTION_CHAINS[playerNation];
  const current = chain[currentTier];
  const next = chain[currentTier + 1];
  hud.setEvolutionInfo(
    current?.name ?? '',
    next ? { name: next.name, cost: next.cost } : null,
    next ? upgradePoints >= next.cost : false,
  );
}

function evolve(): void {
  const chain = EVOLUTION_CHAINS[playerNation];
  const next = chain[currentTier + 1];
  if (!next || upgradePoints < next.cost) return;
  upgradePoints -= next.cost;
  currentTier++;

  const pos = playerTank.group.position;
  const old = playerTank;
  removeLabel(old);
  playerConfig = TANK_BY_ID[next.id];
  playerTank = new Tank(scene, physicsWorld, playerConfig, pos.x, pos.z);
  playerTank.body.position.y = 15;
  TankControls.setupBody(playerTank.body);
  controls.bind(playerTank, scene, physicsWorld);
  controls.currentShellIndex = 0; // reset shell selection for the new gun
  old.dispose(scene, physicsWorld);
  createLabel(playerTank);

  for (const id of Object.keys(upgradeLevels)) {
    if (upgradeLevels[id] > 0) applyUpgrade(id);
  }
  hud.setShell(playerConfig.shells[0].name, 0);
  hud.showMessage(`⬆️ Evolved to ${playerConfig.name}!`);
  refreshUpgradePanel();
}

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'p') {
    upgradePanelOpen = !upgradePanelOpen;
    hud.setUpgradePanelVisible(upgradePanelOpen);
    if (upgradePanelOpen) refreshUpgradePanel();
  }
});
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-upg]') as HTMLButtonElement | null;
  if (btn) {
    buyUpgrade(btn.getAttribute('data-upg')!);
    return;
  }
  if ((e.target as HTMLElement).closest('#upg-evolve-btn')) {
    evolve();
  }
});

// ── Kill tracking — fires directly from Tank.dispose ──
Tank.onTankDestroyed = (tank) => {
  if (gameOver) return;
  const e = enemies.find((en) => en.tank === tank);
  if (e) {
    removeLabel(tank);
    // Only the player's kills award points (enemy-vs-enemy kills don't)
    if (tank.lastHitBy === playerTank) {
      const pts = e.config.tier ?? 1;
      enemiesDestroyed++;
      hud.incrementKills();
      upgradePoints += pts;
      hud.showMessage(`💀 ${e.config.name} destroyed! +${pts} pt${pts > 1 ? 's' : ''} (P)`);
    }
  }
};

// ── Third-person aim marker ────────────────────────────────
const aimMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.55, 24),
  new THREE.MeshBasicMaterial({ color: 0xff6644, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
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
  const x = (Math.random() - 0.5) * 160;
  const z = (Math.random() - 0.5) * 160;
  consumables.push(new Consumable(scene, physicsWorld, new THREE.Vector3(x, 0.5, z), kind));
}

function applyConsumable(c: Consumable): void {
  switch (c.kind) {
    case 'reload':
      hud.showMessage('⚡ AMMO! Reload ready');
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

// ── Enemy target selection: nearest enemy, but always the player when close ──
const PLAYER_AGGRO_RADIUS = 60;
function pickEnemyTarget(e: EnemyState): Tank {
  if (e.tank.group.position.distanceTo(playerTank.group.position) < PLAYER_AGGRO_RADIUS) {
    return playerTank;
  }
  let best: Tank | null = null;
  let bestD = Infinity;
  for (const other of enemies) {
    if (other === e || !other.tank.alive) continue;
    const d = e.tank.group.position.distanceTo(other.tank.group.position);
    if (d < bestD) { bestD = d; best = other.tank; }
  }
  return best ?? playerTank;
}

// ── Enemy AI (drive + fire) for one enemy ──────────────────
function updateEnemyAI(e: EnemyState, dt: number): void {
  if (!e.tank.alive || gameOver) return;
  const body = e.tank.body;
  const target = pickEnemyTarget(e);
  const p = target.group.position;
  const dx = p.x - body.position.x;
  const dz = p.z - body.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.5) return;

  // Turret tracks the target (turret tanks)
  const toTarget = new THREE.Vector3(dx, 0, dz).normalize();
  const eFwd = new THREE.Vector3(0, 0, -1);
  eFwd.applyQuaternion(e.tank.group.quaternion);
  const eAngle = Math.atan2(
    eFwd.x * toTarget.z - eFwd.z * toTarget.x,
    eFwd.x * toTarget.x + eFwd.z * toTarget.z,
  );
  if (!e.tank.isTD) e.tank.setTurretRotation(-eAngle);

  // Movement: chase, strafe, or back off
  let moveX: number, moveZ: number;
  if (dist > 30) { moveX = dx / dist; moveZ = dz / dist; }
  else if (dist < 14) { moveX = -dx / dist; moveZ = -dz / dist; }
  else { moveX = -dz / dist; moveZ = dx / dist; }

  // Rock avoidance
  let steerX = moveX, steerZ = moveZ;
  const probeX = body.position.x + moveX * 4;
  const probeZ = body.position.z + moveZ * 4;
  for (const rock of rockBodies) {
    const rx = probeX - rock.position.x;
    const rz = probeZ - rock.position.z;
    if (rx * rx + rz * rz < 9) {
      steerX = -moveZ; steerZ = moveX;
      break;
    }
  }

  const enemySpeed = 5;
  body.velocity.x = steerX * enemySpeed;
  body.velocity.z = steerZ * enemySpeed;
  if (body.position.y < e.tank.config.hullDimensions[1] / 2) {
    body.position.y = e.tank.config.hullDimensions[1] / 2;
  }

  const faceX = e.tank.isTD ? dx : steerX;
  const faceZ = e.tank.isTD ? dz : steerZ;
  turnHull(body, Math.atan2(faceX, faceZ), dt);

  // Fire at the target with lead + ballistic pitch
  e.reloadTimer -= dt;
  if (e.reloadTimer <= 0) {
    const shellDef = e.config.shells[0];
    const tip = new THREE.Vector3();
    e.tank.barrelTip.getWorldPosition(tip);
    const pVel = target.body.velocity;
    const ddx = p.x - tip.x;
    const ddz = p.z - tip.z;
    const d = Math.sqrt(ddx * ddx + ddz * ddz);
    const flight = d / Math.max(shellDef.muzzleSpeed, 1);
    const aimX = p.x + pVel.x * flight - body.position.x;
    const aimZ = p.z + pVel.z * flight - body.position.z;
    const aimDist = Math.sqrt(aimX * aimX + aimZ * aimZ);
    if (aimDist > 0.5) {
      turnHull(body, Math.atan2(aimX, aimZ), dt, 10);
      if (!e.tank.isTD) {
        const f = new CANNON.Vec3(0, 0, -1);
        body.quaternion.vmult(f, f);
        const ang = Math.atan2(f.x * aimZ - f.z * aimX, f.x * aimX + f.z * aimZ);
        e.tank.setTurretRotation(-ang);
      }
      const drop = (9.82 * aimDist * aimDist) / (2 * shellDef.muzzleSpeed * shellDef.muzzleSpeed);
      e.tank.setBarrelPitch(Math.atan2((p.y - tip.y) + drop, aimDist));
    }
    enemyShells.push(Shell.fire(scene, physicsWorld, e.tank, shellDef));
    e.reloadTimer = e.config.reloadTime + Math.random() * 2;
  }
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const fixedDt = 1 / 60;
  elapsed += fixedDt;

  // Capture enemy HP before the physics step (collide fires inside step)
  for (const e of enemies) e.prevHp = e.tank.hp;

  if (speedBoostTimer > 0) speedBoostTimer -= fixedDt;
  const activeSpeed = SPEED * (speedBoostTimer > 0 ? 1.6 : 1);

  physicsWorld.step(fixedDt, delta, 3);

  controls.updateSniperAim(fixedDt);
  controls.updateTank(activeSpeed, TURN_SPEED, camera);
  const pitch = controls.sniperMode ? controls.sniperAimY : controls.autoBarrelPitch;
  playerTank.setBarrelPitch(pitch);
  playerTank.update();

  controls.updateShells(fixedDt);
  updateParticles(scene, fixedDt);

  // ── Consumables ───────────────────────────────────────
  consumableSpawnTimer -= fixedDt;
  if (consumableSpawnTimer <= 0 && consumables.length < 6) {
    spawnConsumable();
    consumableSpawnTimer = 12;
  }
  for (let i = consumables.length - 1; i >= 0; i--) {
    const c = consumables[i];
    c.update(fixedDt, elapsed);
    if (c.mesh.position.distanceTo(playerTank.group.position) < 2.2) {
      applyConsumable(c);
      consumables.splice(i, 1);
    }
  }

  // ── Blocks ────────────────────────────────────────────
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    block.update();
    if (block.body.position.y < -10) {
      block.destroy(scene, physicsWorld);
      hud.incrementBlocks();
    }
    if (!block.alive) {
      blocks.splice(i, 1);
      aimables.splice(aimables.indexOf(block), 1);
    }
  }

  // ── Enemy AI + respawn + hit markers ──────────────────
  let nearestEnemy: Tank | null = null;
  let nearestDist = Infinity;
  for (const e of enemies) {
    if (e.tank.alive) {
      e.tank.update();
      updateEnemyAI(e, fixedDt);
      const d = e.tank.group.position.distanceTo(playerTank.group.position);
      if (d < nearestDist) { nearestDist = d; nearestEnemy = e.tank; }
      if (e.tank.hp < e.prevHp) {
        hud.showHitMarker();
        followCam.triggerShake(0.15);
      }
    } else {
      // Respawn this enemy after a delay
      if (e.respawnTimer < 0) e.respawnTimer = 3;
      e.respawnTimer -= fixedDt;
      if (e.respawnTimer <= 0) {
        const old = e.tank;
        spawnEnemy(e);
        const idx = aimables.indexOf(old);
        if (idx >= 0) aimables[idx] = e.tank;
      }
    }
  }

  // ── Enemy shells (sync + cleanup) ─────────────────────
  for (let i = enemyShells.length - 1; i >= 0; i--) {
    const s = enemyShells[i];
    s.update(fixedDt);
    if (s.body.position.y < -5 || s.body.position.length() > 400) s.destroy();
    if (!s.alive) enemyShells.splice(i, 1);
  }

  // ── Culling (rocks + enemies by distance) ─────────────
  const pp = playerTank.group.position;
  for (const m of rockMeshes) {
    const dx = m.position.x - pp.x;
    const dz = m.position.z - pp.z;
    m.visible = dx * dx + dz * dz < 120 * 120;
  }
  for (const e of enemies) {
    const dx = e.tank.group.position.x - pp.x;
    const dz = e.tank.group.position.z - pp.z;
    e.tank.group.visible = dx * dx + dz * dz < 150 * 150;
  }

  // ── Aim info ──────────────────────────────────────────
  raycaster.setFromCamera(controls.mouseNDC, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
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
    const shell = controls.currentShell;
    const effectiveArmor = shell.id === 'heat' ? armor : armor / Math.max(cosAngle, 0.05);
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

  // ── Aim marker ────────────────────────────────────────
  if (!controls.sniperMode && !gameOver) {
    const aimPoint = controls.getIntersection(camera);
    aimMarker.visible = !!aimPoint;
    if (aimPoint) aimMarker.position.set(aimPoint.x, 0.05, aimPoint.z);
  } else {
    aimMarker.visible = false;
  }

  followCam.mode = controls.sniperMode ? 'sniper' : 'third-person';
  followCam.update(playerTank, delta);
  hud.setSniperMode(controls.sniperMode);

  hud.updateTank(playerTank);
  hud.updateEnemyTank(nearestEnemy);
  hud.updateReload(controls.reloadProgress, controls.reloadProgress >= 1);
  hud.updateMessage(fixedDt);

  // ── Name labels ───────────────────────────────────────
  updateLabel(playerTank);
  for (const e of enemies) updateLabel(e.tank);

  // ── Game over ─────────────────────────────────────────
  if (!gameOver && (!playerTank.alive || playerTank.hp <= 0)) {
    gameOver = true;
    hud.showGameOver(enemiesDestroyed);
    followCam.triggerShake(0.8);
  }

  // ── Minimap ───────────────────────────────────────────
  if (!gameOver) {
    const pPos = playerTank.group.position;
    hud.drawMinimap(
      { x: pPos.x, z: pPos.z, angle: Math.atan2(pPos.x, pPos.z) },
      nearestEnemy ? { x: nearestEnemy.group.position.x, z: nearestEnemy.group.position.z, angle: 0 } : null,
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
