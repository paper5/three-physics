# Tank Warfare — Three.js + Cannon-es Tank Battles

A fully procedural 3D tank battle game built with **Vite + TypeScript**, **Three.js** for rendering, and **cannon-es** for physics. Drive WWII tanks, fight a roaming enemy, destroy the fortress, and survive random supply drops.

---

## 1. What Is This?

A browser-based tank combat simulator where you:

- 🎮 **Pick one of 6 WWII tanks** (Tiger I, KV-1, M4A3E8 Sherman, T-34/85, SU-152 tank destroyer, or the infamous **Bob Semple**)
- 🔫 **Fight an enemy tank** that respawns with a random vehicle when destroyed
- 🧱 **Blast apart a destructible fortress** with realistic armor-penetration mechanics
- 🏔️ **Drive over a hilly 120×120 map** with a central valley, bases, and a flag
- 📦 **Collect consumables** (reload, repair, speed boost) that spawn randomly

Everything — tanks, terrain, shells, effects — is built **procedurally from primitive shapes and code**. There are no external 3D models or texture assets (a skybox is optional).

---

## 2. How It Works

### Architecture

```
src/
├── components/          # 3D objects + gameplay entities
│   ├── Tank.ts          # Procedural tank models (Tiger, KV-1, Sherman, T-34, SU-152, Bob Semple)
│   ├── Block.ts         # Destructible fortress bricks (HP + color damage states)
│   ├── Shell.ts         # Projectiles with AP/HE/HEAT behavior
│   ├── Consumable.ts    # Random pickups (ammo/repair/speed)
│   ├── Explosion.ts     # Particle effects + fireballs
│   ├── Ground.ts        # Height-mapped terrain (visual) + physics
│   └── TowerGenerator.ts# Procedural fortress
├── data/
│   └── tankConfigs.ts   # Tank stats + shell loadouts
├── systems/             # Game systems
│   ├── Controls.ts      # WASD driving, mouse aim, sniper mode, shell switching
│   ├── FollowCamera.ts  # Third-person + sniper camera
│   ├── HUD.ts           # HTML overlay (HP bars, reload, shell, aim info)
│   ├── MapGenerator.ts  # Bases + central flag
│   ├── PostProcessing.ts# Bloom + SSAO effects
│   └── Skybox.ts        # Skybox loader with gradient fallback
└── utils/
    └── resize.ts        # Window resize handling
```

### Physics & Combat Model

- **Tanks** move via kinematic position updates (no velocity fighting), with direct quaternion hull rotation.
- **Armor penetration** is angle-aware:
  - `effectiveArmor = armor / cos(impactAngle)`
  - **AP**: ricochets at shallow angles (>70°), penetrates when pen > effective armor, RNG in between.
  - **HE**: explodes on any contact — full block damage, blast damage to tanks scaled by armor.
  - **HEAT**: ignores impact angle (chemical round), checks against flat armor.
- **Blocks** have HP that color-shifts brown → yellow → red before exploding.
- **Shells** apply physical impulses on impact, toppling the fortress realistically.

### Controls

| Input | Action |
|---|---|
| **W / S** | Forward / backward |
| **A / D** | Turn hull |
| **Mouse** | Aim turret / barrel (third-person) |
| **Left-click** | Fire |
| **Right-click** | Toggle sniper scope |
| **1 / 2 / 3** | Switch shell type (AP / HE / HEAT) |
| **Scroll wheel** | Zoom camera in/out |

---

## 3. Installation & Playing

### Requirements
- **Node.js** 18+ and **npm**

### Install

```bash
# Clone or navigate to the project
cd three-physics

# Install dependencies
npm install
```

### Run (development)

```bash
npm run dev
```

Open the URL printed in the terminal (usually `http://localhost:5173`) in your browser.

### Build for production

```bash
npm run build
npm run preview   # serve the production build
```

### Playing the Game

1. **Select a tank** from the 6-card menu — each has different armor, gun, and shell types.
2. You spawn at your base (green platform, z=+40). The enemy is across the map at the red base.
3. **Drive** with WASD, **aim** with the mouse, **fire** with left-click.
4. **Right-click** for the sniper scope — move the mouse to aim (low sensitivity), the view holds where you leave it.
5. **Switch shells** with 1/2/3 (check the bottom-right indicator).
6. Destroy the **fortress** at the center-left for bonus destruction, and the **enemy tank** — a new random one drops in 3 seconds.
7. Grab **floating crates** for ammo (instant reload), repair (+40% HP), or speed boost (+60% for 5s).
8. The **central flag** marks the middle of the map — the capture point / rally point.

### Optional: Custom Skybox

Drop 6 square images into `public/skybox/` (`px.jpg`, `nx.jpg`, `py.jpg`, `ny.jpg`, `pz.jpg`, `nz.jpg`) to replace the default gradient sky. See `public/skybox/README.md` for details.

---

## Tank Reference

| Tank | Nation | Armor | Gun | Penetration | Damage | HP | Reload |
|---|---|---|---|---|---|---|---|
| **Tiger I** | Germany | 100mm | 88mm KwK 36 | 120mm | 150 | 1000 | 3.8s |
| **KV-1** | USSR | 75mm | 76mm F-34 | 80mm | 110 | 1200 | 3.0s |
| **M4A3E8 Sherman** | USA | 64mm | 76mm M1 | 105mm | 130 | 950 | 3.4s |
| **T-34/85** | USSR | 60mm | 85mm ZiS-S-53 | 120mm | 135 | 900 | 3.5s |
| **SU-152** 🚜 | USSR | 75mm | 152mm ML-20S | 130mm (HEAT) | 350 | 950 | 8.0s |
| **Bob Semple** 🤡 | NZ | 8mm | .303 MG | 20mm | 30 | 400 | 2.0s |

- **SU-152** is a casemate tank destroyer — **no turret**. The whole hull rotates to aim.
- **Bob Semple** is a corrugated-iron tractor. It is not good. That's the point.
