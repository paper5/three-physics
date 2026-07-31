/**
 * Tank configurations with per-tank shell loadouts (AP / HE / HEAT).
 *
 * Armour values are approximate front-hull thickness (mm).
 */

export type ShellKind = 'ap' | 'he' | 'heat';

export interface ShellDefinition {
  id: ShellKind;
  name: string;
  penetration: number; // mm
  damage: number;
  muzzleSpeed: number; // units/s
  /** HE only: splash radius in units. */
  splash?: number;
}

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
  reloadTime: number;  // seconds
  /** Available shell types for this tank. */
  shells: ShellDefinition[];
}

const AP = (pen: number, dmg: number): ShellDefinition => ({
  id: 'ap', name: 'AP', penetration: pen, damage: dmg, muzzleSpeed: 180,
});
const HE = (pen: number, dmg: number, splash: number): ShellDefinition => ({
  id: 'he', name: 'HE', penetration: pen, damage: dmg, muzzleSpeed: 140, splash,
});
const HEAT = (pen: number, dmg: number): ShellDefinition => ({
  id: 'heat', name: 'HEAT', penetration: pen, damage: dmg, muzzleSpeed: 120,
});

export const TIGER_I: TankConfig = {
  id: 'tiger',
  name: 'Tiger I',
  nation: 'Germany',

  hullColor: 0x7a7a72,
  turretColor: 0x6e6e66,
  hullDimensions: [4.2, 0.85, 6.4],
  turretDimensions: [2.6, 0.45, 2.6],
  barrelLength: 3.8,

  hp: 1000,
  hullArmor: 100,
  sideArmor: 80,
  turretArmor: 100,
  reloadTime: 3.8,
  shells: [AP(120, 150), HE(30, 200, 2.0)],
};

export const KV_1: TankConfig = {
  id: 'kv1',
  name: 'KV-1',
  nation: 'USSR',

  hullColor: 0x4a6b2a,
  turretColor: 0x557733,
  hullDimensions: [3.8, 0.9, 5.8],
  turretDimensions: [2.8, 0.5, 2.8],
  barrelLength: 3.0,

  hp: 1200,
  hullArmor: 75,
  sideArmor: 75,
  turretArmor: 75,
  reloadTime: 3.0,
  shells: [AP(80, 110), HE(28, 170, 2.5)],
};

export const SHERMAN: TankConfig = {
  id: 'sherman',
  name: 'M4A3E8 Sherman',
  nation: 'USA',

  hullColor: 0x5a6b3a,
  turretColor: 0x4f5f33,
  hullDimensions: [3.5, 0.8, 5.8],
  turretDimensions: [2.5, 0.4, 2.5],
  barrelLength: 3.2,

  hp: 950,
  hullArmor: 64,
  sideArmor: 38,
  turretArmor: 76,
  reloadTime: 3.4,
  shells: [AP(105, 130), HE(32, 180, 2.0)],
};

export const T34_85: TankConfig = {
  id: 't34',
  name: 'T-34/85',
  nation: 'USSR',

  hullColor: 0x55602e,
  turretColor: 0x4d5a2a,
  hullDimensions: [3.6, 0.85, 6.0],
  turretDimensions: [2.6, 0.5, 2.6],
  barrelLength: 3.6,

  hp: 900,
  hullArmor: 60,
  sideArmor: 45,
  turretArmor: 90,
  reloadTime: 3.5,
  shells: [AP(120, 135), HE(35, 190, 2.2)],
};

export const SU_152: TankConfig = {
  id: 'su152',
  name: 'SU-152',
  nation: 'USSR',
  hasTurret: false,

  hullColor: 0x4a5a28,
  turretColor: 0x42522a,
  hullDimensions: [3.6, 1.1, 6.2],
  turretDimensions: [2.4, 0.7, 2.0],
  barrelLength: 2.8,

  hp: 950,
  hullArmor: 75,
  sideArmor: 60,
  turretArmor: 75,
  reloadTime: 8.0,
  // A howitzer: no AP, big HE + HEAT
  shells: [HE(45, 350, 3.5), HEAT(130, 300)],
};

export const BOB_SEMPLE: TankConfig = {
  id: 'bobsemple',
  name: 'Bob Semple',
  nation: 'New Zealand',

  hullColor: 0x8a6a4a,
  turretColor: 0x7a5a3a,
  hullDimensions: [2.8, 0.7, 4.2],
  turretDimensions: [1.4, 0.3, 1.4],
  barrelLength: 1.4,

  hp: 400,
  hullArmor: 8,
  sideArmor: 6,
  turretArmor: 8,
  reloadTime: 2.0,
  // Just a machine gun — AP only
  shells: [AP(20, 30)],
};
