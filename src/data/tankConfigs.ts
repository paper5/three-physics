/**
 * Semi-realistic tank configurations for Tiger I and KV-1.
 *
 * Armour values are approximate front-hull thickness (mm).
 * Penetration values are for AP shells at ~500m range.
 */

export interface TankConfig {
  id: string;
  name: string;
  nation: string;

  // Appearance
  hullColor: number;
  turretColor: number;
  hullDimensions: [number, number, number]; // width, height, length
  turretDimensions: [number, number, number]; // width, height, length
  barrelLength: number;

  // Combat stats
  hp: number;
  hullArmor: number;  // mm — front hull
  sideArmor: number;  // mm — side hull
  turretArmor: number; // mm — front turret
  shellPenetration: number; // mm — AP shell at 500m
  shellDamage: number;
  reloadTime: number;  // seconds
  muzzleSpeed: number; // units/s
}

export const TIGER_I: TankConfig = {
  id: 'tiger',
  name: 'Tiger I',
  nation: 'Germany',

  hullColor: 0x7a7a72,  // dark gray / field-gray
  turretColor: 0x6e6e66,
  hullDimensions: [4.2, 0.85, 6.4],
  turretDimensions: [2.6, 0.45, 2.6],
  barrelLength: 3.8,

  hp: 1000,
  hullArmor: 100,  // 100mm front plate
  sideArmor: 80,   // 80mm side
  turretArmor: 100, // 100mm front mantlet
  shellPenetration: 120, // 88mm KwK 36 AP at 500m
  shellDamage: 150,
  reloadTime: 3.8,  // ~16 rounds/min
  muzzleSpeed: 90,
};

export const KV_1: TankConfig = {
  id: 'kv1',
  name: 'KV-1',
  nation: 'USSR',

  hullColor: 0x4a6b2a,  // soviet green
  turretColor: 0x557733,
  hullDimensions: [3.8, 0.9, 5.8],
  turretDimensions: [2.8, 0.5, 2.8],
  barrelLength: 3.0,

  hp: 1200,
  hullArmor: 75,   // 75mm front (some variants 90)
  sideArmor: 75,   // 75mm side
  turretArmor: 75,  // 75mm front
  shellPenetration: 80, // 76mm F-34 AP at 500m
  shellDamage: 110,
  reloadTime: 3.0,  // ~20 rounds/min
  muzzleSpeed: 90,
};
