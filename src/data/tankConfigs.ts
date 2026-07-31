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
  /** false = casemate tank destroyer (no rotating turret). Default true. */
  hasTurret?: boolean;

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

export const SHERMAN: TankConfig = {
  id: 'sherman',
  name: 'M4A3E8 Sherman',
  nation: 'USA',

  hullColor: 0x5a6b3a,  // olive drab
  turretColor: 0x4f5f33,
  hullDimensions: [3.5, 0.8, 5.8],
  turretDimensions: [2.5, 0.4, 2.5],
  barrelLength: 3.2,

  hp: 950,
  hullArmor: 64,   // ~64mm glacis
  sideArmor: 38,   // 38mm side
  turretArmor: 76, // 76mm mantlet
  shellPenetration: 105, // 76mm M1A2 AP at 500m
  shellDamage: 130,
  reloadTime: 3.4,
  muzzleSpeed: 90,
};

export const T34_85: TankConfig = {
  id: 't34',
  name: 'T-34/85',
  nation: 'USSR',

  hullColor: 0x55602e,  // soviet green-brown
  turretColor: 0x4d5a2a,
  hullDimensions: [3.6, 0.85, 6.0],
  turretDimensions: [2.6, 0.5, 2.6],
  barrelLength: 3.6,

  hp: 900,
  hullArmor: 60,   // 60mm sloped glacis
  sideArmor: 45,   // 45mm side
  turretArmor: 90, // 90mm turret front
  shellPenetration: 120, // 85mm ZiS-S-53 AP at 500m
  shellDamage: 135,
  reloadTime: 3.5,
  muzzleSpeed: 90,
};

export const SU_152: TankConfig = {
  id: 'su152',
  name: 'SU-152',
  nation: 'USSR',
  hasTurret: false, // casemate tank destroyer

  hullColor: 0x4a5a28,
  turretColor: 0x42522a,
  hullDimensions: [3.6, 1.1, 6.2],
  turretDimensions: [2.4, 0.7, 2.0], // fixed casemate
  barrelLength: 2.8,

  hp: 950,
  hullArmor: 75,   // 75mm casemate front
  sideArmor: 60,   // 60mm side
  turretArmor: 75, // casemate front
  shellPenetration: 130, // 152mm ML-20S HEAT
  shellDamage: 350, // massive howitzer damage
  reloadTime: 8.0, // slow
  muzzleSpeed: 90,
};

export const BOB_SEMPLE: TankConfig = {
  id: 'bobsemple',
  name: 'Bob Semple',
  nation: 'New Zealand',

  hullColor: 0x8a6a4a,  // rusty corrugated iron
  turretColor: 0x7a5a3a,
  hullDimensions: [2.8, 0.7, 4.2],  // tiny tractor chassis
  turretDimensions: [1.4, 0.3, 1.4], // tiny cupola
  barrelLength: 1.4,  // machine gun barrel

  hp: 400,
  hullArmor: 8,    // corrugated iron!
  sideArmor: 6,    // even less on the sides
  turretArmor: 8,
  shellPenetration: 20, // .303 machine gun
  shellDamage: 30,
  reloadTime: 2.0, // fast fire rate
  muzzleSpeed: 90,
};
