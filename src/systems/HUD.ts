import type { Tank } from '../components/Tank';

export interface AimInfo {
  name: string;
  armor: number;
  angleDeg: number;
  effectiveArmor: number;
  penetration: number;
  willPen: boolean;
  penChance: number;
  /** True if angle auto-ricochets (>70°) */
  autoRicochet: boolean;
  /** RNG bounce chance if not auto */
  ricochetChance: number;
}

/**
 * World of Tanks-style HUD.
 */
export class HUD {
  private shellsEl: HTMLElement;
  private blocksEl: HTMLElement;
  private hpBar: HTMLElement;
  private hpText: HTMLElement;
  private reloadFill: HTMLElement;

  /** Aim info panel elements */
  private aimPanel: HTMLElement;
  private aimNameEl: HTMLElement;
  private aimArmorEl: HTMLElement;
  private aimAngleEl: HTMLElement;
  private aimStatusEl: HTMLElement;

  /** Enemy HP elements */
  private enemyHpFill: HTMLElement;
  private enemyHpText: HTMLElement;
  private enemyHpContainer: HTMLElement;

  private _shellsFired = 0;
  private _blocksDestroyed = 0;
  private _kills = 0;
  private hitMarker: HTMLElement;
  private scopeOverlay: HTMLElement;
  private shellEl: HTMLElement;
  private msgEl: HTMLElement;
  private msgTimer = 0;
  private minimapCtx: CanvasRenderingContext2D;
  private gameOverEl: HTMLElement;
  private killsEl: HTMLElement;
  private upgPanel: HTMLElement;
  private upgPtsEl: HTMLElement;
  private upgListEl: HTMLElement;

  constructor(container: HTMLElement = document.body) {
    // ── Minimap (top right) ───────────────────────────────
    const mm = document.createElement('canvas');
    mm.id = 'hud-minimap';
    mm.width = 160;
    mm.height = 160;
    container.appendChild(mm);
    this.minimapCtx = mm.getContext('2d')!;

    // ── Upgrade panel ─────────────────────────────────────
    const upg = document.createElement('div');
    upg.id = 'hud-upgrades';
    upg.innerHTML = `
      <div class="upg-header">🔧 UPGRADES — <span id="upg-pts">0</span> pts</div>
      <div id="upg-list"></div>
    `;
    upg.style.display = 'none';
    container.appendChild(upg);
    this.upgPanel = upg;
    this.upgPtsEl = upg.querySelector('#upg-pts')!;
    this.upgListEl = upg.querySelector('#upg-list')!;

    // ── Game over overlay ─────────────────────────────────
    const go = document.createElement('div');
    go.id = 'hud-gameover';
    go.innerHTML = `
      <h1>💥 TANK DESTROYED</h1>
      <div id="hud-score">Enemies destroyed: <span id="hud-score-n">0</span></div>
      <button id="hud-restart">PLAY AGAIN</button>
    `;
    go.style.display = 'none';
    container.appendChild(go);
    this.gameOverEl = go;
    go.querySelector('#hud-restart')!.addEventListener('click', () => {
      location.reload();
    });
    // ── Shell indicator (bottom right) ────────────────────
    const shell = document.createElement('div');
    shell.id = 'hud-shell';
    shell.innerHTML = `<span id="hud-shell-name">AP</span><span id="hud-shell-hint">[1]</span>`;
    container.appendChild(shell);
    this.shellEl = shell;

    // ── Pickup messages (top center) ──────────────────────
    const msg = document.createElement('div');
    msg.id = 'hud-msg';
    container.appendChild(msg);
    this.msgEl = msg;
    // ── Player HP bar (top left) ──────────────────────────
    const hpContainer = document.createElement('div');
    hpContainer.id = 'hud-hp';
    hpContainer.innerHTML = `
      <div id="hud-hp-label">TANK</div>
      <div id="hud-hp-track"><div id="hud-hp-fill"></div></div>
      <div id="hud-hp-text">400 / 400</div>
    `;
    container.appendChild(hpContainer);

    // ── Enemy HP bar (top left, below player) ────────────
    const ehp = document.createElement('div');
    ehp.id = 'hud-enemy-hp';
    ehp.innerHTML = `
      <div id="hud-enemy-label">ENEMY</div>
      <div id="hud-enemy-track"><div id="hud-enemy-fill"></div></div>
      <div id="hud-enemy-text">400 / 400</div>
    `;
    ehp.style.display = 'none'; // hidden until enemy exists
    container.appendChild(ehp);

    // ── Stats (top right) ─────────────────────────────────
    const stats = document.createElement('div');
    stats.id = 'hud-stats';
    stats.innerHTML = `
      <div>🔫 <span id="hud-shells">0</span></div>
      <div>🧱 <span id="hud-blocks">0</span></div>
      <div>💀 <span id="hud-kills-n">0</span></div>
    `;
    container.appendChild(stats);
    this.killsEl = stats.querySelector('#hud-kills-n')!;

    // ── Aim info panel (below crosshair area) ─────────────
    const aim = document.createElement('div');
    aim.id = 'hud-aim';
    aim.style.display = 'none';
    aim.innerHTML = `
      <div id="hud-aim-name">—</div>
      <div id="hud-aim-details">
        <span>ARMOR <span id="hud-aim-armor">—</span></span>
        <span>ANGLE <span id="hud-aim-angle">—</span></span>
      </div>
      <div id="hud-aim-status">—</div>
    `;
    container.appendChild(aim);

    // ── Reload indicator (bottom center) ──────────────────
    const reloadContainer = document.createElement('div');
    reloadContainer.id = 'hud-reload';
    reloadContainer.innerHTML = `
      <svg viewBox="0 0 100 100" id="hud-reload-svg">
        <circle cx="50" cy="50" r="42" id="hud-reload-track" />
        <circle cx="50" cy="50" r="42" id="hud-reload-fill" />
      </svg>
      <div id="hud-reload-text">READY</div>
    `;
    container.appendChild(reloadContainer);

    // ── Crosshair ─────────────────────────────────────────
    const ch = document.createElement('div');
    ch.id = 'hud-crosshair';
    ch.innerHTML = '✚';
    container.appendChild(ch);

    // ── Hit marker ────────────────────────────────────────
    const hm = document.createElement('div');
    hm.id = 'hud-hitmarker';
    hm.innerHTML = '✕';
    container.appendChild(hm);
    this.hitMarker = hm;

    // ── Sniper scope overlay ──────────────────────────────
    const scope = document.createElement('div');
    scope.id = 'hud-scope';
    scope.innerHTML = `
      <div class="scope-ring"></div>
      <div class="scope-hline"></div>
      <div class="scope-vline"></div>
      <div class="scope-center"></div>
      <div class="scope-vignette"></div>
    `;
    scope.style.display = 'none';
    container.appendChild(scope);
    this.scopeOverlay = scope;

    // Refs
    this.shellsEl = stats.querySelector('#hud-shells')!;
    this.blocksEl = stats.querySelector('#hud-blocks')!;
    this.hpBar = hpContainer.querySelector('#hud-hp-fill')!;
    this.hpText = hpContainer.querySelector('#hud-hp-text')!;
    this.reloadFill = reloadContainer.querySelector('#hud-reload-fill')!;

    this.aimPanel = aim;
    this.aimNameEl = aim.querySelector('#hud-aim-name')!;
    this.aimArmorEl = aim.querySelector('#hud-aim-armor')!;
    this.aimAngleEl = aim.querySelector('#hud-aim-angle')!;
    this.aimStatusEl = aim.querySelector('#hud-aim-status')!;

    this.enemyHpContainer = ehp;
    this.enemyHpFill = ehp.querySelector('#hud-enemy-fill')!;
    this.enemyHpText = ehp.querySelector('#hud-enemy-text')!;

    container.addEventListener('mousemove', (e) => {
      ch.style.left = `${e.clientX}px`;
      ch.style.top = `${e.clientY}px`;
    });
  }

  // ── Counters ─────────────────────────────────────────────

  incrementShells(): void { this._shellsFired++; this.shellsEl.textContent = String(this._shellsFired); }
  incrementBlocks(): void { this._blocksDestroyed++; this.blocksEl.textContent = String(this._blocksDestroyed); }
  incrementKills(): void {
    this._kills++;
    this.killsEl.textContent = String(this._kills);
  }

  /** Toggle the upgrade panel visibility. */
  setUpgradePanelVisible(show: boolean): void {
    this.upgPanel.style.display = show ? 'block' : 'none';
  }

  /** Rebuild the upgrade list from current state. */
  refreshUpgrades(
    points: number,
    upgrades: { id: string; name: string; desc: string; max: number }[],
    levels: Record<string, number>,
  ): void {
    this.upgPtsEl.textContent = String(points);
    this.upgListEl.innerHTML = '';
    for (const u of upgrades) {
      const lvl = levels[u.id] ?? 0;
      const row = document.createElement('div');
      row.className = 'upg-row';
      row.innerHTML = `
        <span class="upg-info">
          <span class="upg-name">${u.name}</span>
          <span class="upg-desc">${u.desc}</span>
        </span>
        <button data-upg="${u.id}" ${lvl >= u.max ? 'disabled' : ''}>
          ${lvl >= u.max ? 'MAX' : `Lv${lvl + 1}/${u.max} (1pt)`}
        </button>`;
      this.upgListEl.appendChild(row);
    }
  }

  // ── Player HP ───────────────────────────────────────────

  updateTank(tank: Tank): void {
    const ratio = tank.hp / tank.maxHp;
    this.hpBar.style.width = `${ratio * 100}%`;
    this.hpText.textContent = `${Math.ceil(tank.hp)} / ${tank.maxHp}`;
    const r = Math.min(1, (1 - ratio) * 2);
    const g = Math.min(1, ratio * 2);
    this.hpBar.style.backgroundColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, 50)`;
  }

  // ── Enemy HP (call each frame) ──────────────────────────

  updateEnemyTank(tank: Tank | null): void {
    if (!tank || !tank.alive) {
      this.enemyHpContainer.style.display = 'none';
      return;
    }
    this.enemyHpContainer.style.display = 'flex';
    const ratio = tank.hp / tank.maxHp;
    this.enemyHpFill.style.width = `${ratio * 100}%`;
    this.enemyHpText.textContent = `${Math.ceil(tank.hp)} / ${tank.maxHp}`;
    const r = Math.min(1, (1 - ratio) * 2);
    const g = Math.min(1, ratio * 2);
    this.enemyHpFill.style.backgroundColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, 50)`;
  }

  // ── Reload ───────────────────────────────────────────────

  updateReload(progress: number, ready: boolean): void {
    const circumference = 2 * Math.PI * 42;
    const offset = circumference * (1 - progress);
    this.reloadFill.style.strokeDasharray = `${circumference}`;
    this.reloadFill.style.strokeDashoffset = `${offset}`;
    const text = document.getElementById('hud-reload-text')!;
    text.textContent = ready ? 'READY' : `${Math.ceil((1 - progress) * 100)}%`;
    text.style.color = ready ? '#4f4' : '#aaa';
  }

  // ── Aim info ─────────────────────────────────────────────

  updateAimInfo(info: AimInfo | null): void {
    if (!info) {
      this.aimPanel.style.display = 'none';
      return;
    }
    this.aimPanel.style.display = 'block';
    this.aimNameEl.textContent = info.name;
    this.aimArmorEl.textContent = `${info.armor}mm (eff: ${Math.round(info.effectiveArmor)}mm)`;
    this.aimAngleEl.textContent = `${Math.round(info.angleDeg)}°`;
    this.aimAngleEl.style.color = info.angleDeg > 60 ? '#f44' : info.angleDeg > 40 ? '#fa0' : '#4f4';

    if (info.autoRicochet) {
      this.aimStatusEl.textContent = `✗ BOUNCE (${Math.round(info.angleDeg)}°)`;
      this.aimStatusEl.style.color = '#f44';
    } else if (info.willPen) {
      this.aimStatusEl.textContent = `✓ PEN ${Math.round(info.penetration)}mm > ${Math.round(info.effectiveArmor)}mm`;
      this.aimStatusEl.style.color = '#4f4';
    } else {
      const penPct = Math.round(info.penChance * 100);
      const ricPct = Math.round(info.ricochetChance * 100);
      this.aimStatusEl.textContent = `${penPct}% PEN / ${ricPct}% RICOCHET`;
      this.aimStatusEl.style.color = '#fa0';
    }
  }

  /** Show/hide the sniper scope overlay. */
  setSniperMode(active: boolean): void {
    this.scopeOverlay.style.display = active ? 'block' : 'none';
    const crosshair = document.getElementById('hud-crosshair');
    if (crosshair) crosshair.style.display = active ? 'none' : 'block';
  }

  /** Flash a hit marker when a shot connects. */
  showHitMarker(): void {
    this.hitMarker.classList.remove('hit');
    // Force reflow so the animation replays
    void this.hitMarker.offsetWidth;
    this.hitMarker.classList.add('hit');
  }

  /** Update the shell type indicator. */
  setShell(name: string, index: number): void {
    this.shellEl.innerHTML =
      `<span id="hud-shell-name">${name}</span><span id="hud-shell-hint">[${index + 1}]</span>`;
    // Colour-code the shell type
    const el = this.shellEl.querySelector('#hud-shell-name') as HTMLElement;
    el.style.color = name === 'HE' ? '#f77' : name === 'HEAT' ? '#4f7' : '#fc8';
  }

  /** Show a transient pickup message. */
  showMessage(text: string, duration = 2): void {
    this.msgEl.textContent = text;
    this.msgEl.style.opacity = '1';
    this.msgTimer = duration;
  }

  /** Fade the message. Call each frame. */
  updateMessage(dt: number): void {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) {
        this.msgEl.style.opacity = '0';
      }
    }
  }

  /** Show the game-over overlay with the score. */
  showGameOver(enemiesDestroyed: number): void {
    this.gameOverEl.style.display = 'flex';
    const score = this.gameOverEl.querySelector('#hud-score-n')!;
    score.textContent = String(enemiesDestroyed);
  }

  /** Draw the minimap. Pass world positions; coords are normalized -60..60. */
  drawMinimap(
    playerPos: { x: number; z: number; angle: number },
    enemyPos: { x: number; z: number; angle: number } | null,
    flagPos: { x: number; z: number },
    items: { x: number; z: number; color: string }[],
    wallPositions: { x: number; z: number }[],
  ): void {
    const ctx = this.minimapCtx;
    const size = 160;
    ctx.clearRect(0, 0, size, size);

    // Background
    ctx.fillStyle = 'rgba(10,25,10,0.85)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(120,160,90,0.4)';
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    const toPx = (v: number) => (v + 60) / 120 * size;

    // Fortress blocks
    for (const w of wallPositions) {
      ctx.fillStyle = 'rgba(140,100,60,0.8)';
      ctx.fillRect(toPx(w.x) - 1.5, toPx(w.z) - 1.5, 3, 3);
    }

    // Consumables
    for (const it of items) {
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(toPx(it.x), toPx(it.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flag
    ctx.fillStyle = '#ffd900';
    ctx.beginPath();
    ctx.arc(toPx(flagPos.x), toPx(flagPos.z), 4, 0, Math.PI * 2);
    ctx.fill();

    // Enemy
    if (enemyPos) {
      this.drawTankArrow(ctx, toPx(enemyPos.x), toPx(enemyPos.z), enemyPos.angle, '#ff5544');
    }

    // Player (drawn last, on top)
    this.drawTankArrow(ctx, toPx(playerPos.x), toPx(playerPos.z), playerPos.angle, '#44ff66');
  }

  private drawTankArrow(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, angle: number, color: string,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -3.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  get shellsFired(): number { return this._shellsFired; }
  get blocksDestroyed(): number { return this._blocksDestroyed; }
}
