import * as CANNON from 'cannon-es';
import * as THREE from 'three';

import { Block } from './Block';

const BW = 1.0; // block width  (X)
const BH = 0.5; // block height (Y)
const BD = 0.8; // block depth  (Z)

/**
 * Procedurally stacks ~96 physics boxes into a castle-wall shape.
 *
 * Layout: 8 wide × 2 deep × 5 high with staggered bricks,
 * plus a small tower at each end (2 wide × 2 deep × 2 high).
 */
export function generateFortress(
  scene: THREE.Scene,
  world: CANNON.World,
  xOff = 0,
  zOff = 0,
): Block[] {
  const blocks: Block[] = [];
  const colors = [0x8b5e3c, 0x7a5030, 0x6b4528, 0x9a6e4a];

  const pick = () => colors[Math.floor(Math.random() * colors.length)];

  // ── Wall section (8 × 2 × 5) ───────────────────────────
  const WALL_W = 8;
  const WALL_D = 2;
  const WALL_H = 5;

  for (let layer = 0; layer < WALL_H; layer++) {
    // Brick pattern: offset every other layer by half a block width
    const xStag = (layer % 2) * BW * 0.5;
    const zStag = (layer % 2) * BD * 0.3; // slight depth stagger
    for (let col = 0; col < WALL_W; col++) {
      for (let dep = 0; dep < WALL_D; dep++) {
        const x = col * BW + xStag + xOff - (WALL_W * BW) / 2;
        const y = layer * BH + BH / 2;
        const z = dep * BD + zStag + zOff - (WALL_D * BD) / 2;
        blocks.push(
          new Block(
            scene,
            world,
            new THREE.Vector3(x, y, z),
            new THREE.Vector3(BW, BH, BD),
            pick(),
          ),
        );
      }
    }
  }

  // ── Flanking towers (left & right, 2 × 2 × 2) ─────────
  const TW = 2;
  const TD = 2;
  const TH = 2;

  for (const side of [-1, 1]) {
    const towerX = side * (WALL_W * BW * 0.5 + TW * BW * 0.5 + BW * 0.5);
    for (let layer = 0; layer < TH; layer++) {
      for (let col = 0; col < TW; col++) {
        for (let dep = 0; dep < TD; dep++) {
          const x = towerX + col * BW - (TW * BW) / 2 + xOff;
          const y = layer * BH + BH / 2;
          const z = dep * BD - (TD * BD) / 2 + zOff;
          blocks.push(
            new Block(
              scene,
              world,
              new THREE.Vector3(x, y, z),
              new THREE.Vector3(BW, BH, BD),
              pick(),
            ),
          );
        }
      }
    }
  }

  console.log(`[TowerGenerator] spawned ${blocks.length} blocks`);
  return blocks;
}
