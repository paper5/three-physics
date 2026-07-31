import * as THREE from 'three';

import { Block } from './components/Block';
import { createGround } from './components/Ground';
import { updateParticles } from './components/Explosion';
import { Tank } from './components/Tank';
import { generateFortress } from './components/TowerGenerator';
import { TIGER_I, KV_1 } from './data/tankConfigs';
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

function startGame(choice: 'tiger' | 'kv1') {
  if (choice === 'tiger') { playerConfig = TIGER_I; enemyConfig = KV_1; }
  else { playerConfig = KV_1; enemyConfig = TIGER_I; }

  // Tanks at their bases
  playerTank = new Tank(scene, physicsWorld, playerConfig, 0, 46);
  enemyTank = new Tank(scene, physicsWorld, enemyConfig, 0, -46);

  controls = new TankControls(renderer.domElement);
  controls.bind(playerTank, scene, physicsWorld);
  TankControls.setupBody(playerTank.body);
  controls.onShellFired = () => hud.incrementShells();
  controls.onZoom = (dir) => {
    followCam.distance = Math.max(6, Math.min(30, followCam.distance - dir * 2));
    followCam.height = Math.max(4, Math.min(20, followCam.height - dir * 1.2));
  };

  followCam = new FollowCamera(camera, { distance: 14, height: 10 });

  // Small destructible wall near flag (not the massive fortress)
  blocks = generateFortress(scene, physicsWorld, -28, 0);
  aimables = [enemyTank, ...blocks];

  document.getElementById('hud-selector')?.classList.add('hidden');
  animate();
}

document.querySelectorAll('.sel-card').forEach((card) => {
  card.addEventListener('click', () => {
    const tank = card.getAttribute('data-tank');
    if (tank === 'tiger' || tank === 'kv1') startGame(tank);
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
const SPEED = 10;
const TURN_SPEED = 2;

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const fixedDt = 1 / 60;

  physicsWorld.step(fixedDt, delta, 3);

  controls.updateTank(SPEED, TURN_SPEED, camera);
  const pitch = controls.sniperMode ? controls.barrelPitch : controls.autoBarrelPitch;
  playerTank.setBarrelPitch(pitch);
  playerTank.update();

  controls.updateShells(fixedDt);
  updateParticles(scene, fixedDt);

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
    enemyTank.setTurretRotation(-eAngle);
  }

  if (enemyTank.hp < prevEnemyHp) {
    hud.showHitMarker();
    followCam.triggerShake(0.15);
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
    const effectiveArmor = armor / Math.max(cosAngle, 0.05);
    const pen = playerConfig.shellPenetration;
    const penChance = pen / effectiveArmor;

    aimInfo = {
      name: target instanceof Tank ? target.name : 'WALL',
      armor, angleDeg, effectiveArmor, penetration: pen,
      willPen: penChance >= 1 || angleDeg > 70,
      penChance: Math.min(1, penChance),
      autoRicochet: angleDeg > 70,
      ricochetChance: Math.max(0, 1 - penChance),
    };
    break;
  }
  hud.updateAimInfo(aimInfo);

  followCam.mode = controls.sniperMode ? 'sniper' : 'third-person';
  followCam.update(playerTank, delta);

  hud.updateTank(playerTank);
  hud.updateEnemyTank(enemyTank);
  hud.updateReload(controls.reloadProgress, controls.reloadProgress >= 1);

  composer.render();
}
