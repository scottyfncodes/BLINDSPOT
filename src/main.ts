/**
 * The host: owns the loop, the canvas, the DOM interface and the save, and
 * passes input to the sim. The sim never touches any of this.
 */
import './ui/styles.css';
import { Loop, TICK_DT } from './core/loop';
import { Audio } from './audio/audio';
import { Gestures, keyVector, STICK_RADIUS } from './input/gestures';
import { Renderer } from './render/renderer';
import { load, store, type SaveData } from './save/save';
import { clockLabel } from './sim/clock';
import { STATUS_LABEL, type Fact } from './sim/intel';
import { lead, nightReport } from './sim/report';
import { Sim, type Action, type LiftSetup } from './sim/sim';
import { PRICES, TIPS } from './content/station';
import { DipView } from './ui/dipView';
import { el, esc } from './ui/dom';

type Screen = 'title' | 'play' | 'paused' | 'casefile' | 'kiosk' | 'dip' | 'report';

const ALERT_NAMES = ['Calm', 'Wary', 'Searching', 'Lockdown'];
const touchDevice = matchMedia('(pointer: coarse)').matches;

class Game {
  private canvas = document.getElementById('world') as HTMLCanvasElement;
  private ui = document.getElementById('ui')!;
  private renderer = new Renderer(this.canvas, import.meta.env.BASE_URL);
  private audio = new Audio();
  private gestures = new Gestures();
  private keys = new Set<string>();
  private save: SaveData = load();
  sim = new Sim(this.seedFor(this.save.nights), this.save.carry);
  screen: Screen = 'title';
  private actions: Action[] = [];
  private hoodQueued = false;
  private loop: Loop;
  private hud!: HTMLElement;
  private panel: HTMLElement | null = null;
  private dip: DipView | null = null;
  private lastHud = new Map<string, string>();
  private moved = 0;
  private leadTimer = 0;

  constructor() {
    this.renderer.reducedMotion = this.reducedMotion;
    this.audio.muted = !this.save.settings.sound;
    this.buildHud();
    this.bindInput();
    this.bindSim();
    this.resize();
    addEventListener('resize', () => this.resize());
    visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.screen === 'play') this.pause(); });
    this.loop = new Loop({
      fixed: (dt) => this.fixed(dt),
      render: (alpha, frameDt) => this.frame(alpha, frameDt),
    });
    this.loop.start();
    this.showTitle();
  }

  private get reducedMotion(): boolean {
    return this.save.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private seedFor(night: number): number { return 0x1c3a1 + night * 7919; }

  private resize(): void {
    const w = visualViewport?.width ?? innerWidth, h = visualViewport?.height ?? innerHeight;
    this.renderer.resize(Math.round(w), Math.round(h));
  }

  // ----------------------------------------------------------- loop

  private fixed(dt: number): void {
    if (this.screen !== 'play') return;
    const v = this.gestures.active ? this.gestures.vector() : keyVector(this.keys);
    const before = { ...this.sim.player.pos };
    this.sim.step(dt, { mx: v.x, my: v.y, hood: this.hoodQueued });
    this.hoodQueued = false;
    this.moved += Math.hypot(this.sim.player.pos.x - before.x, this.sim.player.pos.y - before.y);
    this.sim.bus.flush();
  }

  private frame(alpha: number, frameDt: number): void {
    this.renderer.zoom = this.gestures.zoom;
    if (this.screen === 'play') this.actions = this.sim.actions();
    this.renderer.render(this.sim, this.screen === 'play' ? alpha : 1, frameDt, this.screen === 'play' ? this.actions : []);
    this.audio.setIntensity(this.sim.alert);
    this.audio.tick(frameDt, this.screen === 'play' ? this.sim.exposure : 0);
    this.updateHud();
  }

  // ----------------------------------------------------------- sim events

  private bindSim(): void {
    const bus = this.sim.bus;
    bus.on('toast', (e) => this.toast(e.text, e.tone));
    bus.on('shout', (e) => { this.renderer.shout(e.id, e.text, true, this.sim.t); this.audio.cue('shout'); });
    bus.on('flag', () => { this.renderer.flag(); this.audio.cue('flag'); this.buzz(80); });
    bus.on('alert', () => {});
    bus.on('fact', (e) => {
      const f = this.sim.facts.get(e.id)!;
      if (e.status === 'confirmed') { this.toast(`Case file: ${f.title}`, 'known'); this.audio.cue('fact'); }
      if (e.status === 'false') { this.toast(`Case file: ${f.title} was a lie`, 'bad'); this.audio.cue('deny'); }
    });
    bus.on('sfx', (e) => this.audio.cue(e.name));
    bus.on('end', (e) => {
      if (e.reason === 'caught') { this.audio.cue('caught'); this.buzz(200); }
      setTimeout(() => this.showReport(), e.reason === 'caught' ? 1400 : 600);
    });
  }

  private buzz(ms: number): void { try { navigator.vibrate?.(ms); } catch { /* not supported */ } }

  // ----------------------------------------------------------- input

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.screen !== 'play') return;
      e.preventDefault();
      c.setPointerCapture?.(e.pointerId);
      this.audio.unlock();
      this.gestures.down(e.pointerId, e.clientX, e.clientY);
    });
    c.addEventListener('pointermove', (e) => { if (this.screen === 'play') this.gestures.move(e.pointerId, e.clientX, e.clientY); });
    const up = (e: PointerEvent) => this.gestures.up(e.pointerId);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.gestures.wheel(e.deltaY); }, { passive: false });
    // Nothing on this page scrolls, zooms or selects by accident.
    document.addEventListener('touchmove', (e) => { if (!(e.target as HTMLElement).closest('.scroll')) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return;
      this.keys.add(e.code);
      this.audio.unlock();
      if (this.screen === 'play') {
        if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); this.act(0); }
        if (e.code === 'KeyQ') this.act(1);
        if (e.code === 'KeyH') this.hoodQueued = true;
        if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); this.openCaseFile(); }
        if (e.code === 'Escape' || e.code === 'KeyP') this.pause();
      } else if (e.code === 'Escape' && (this.screen === 'paused' || this.screen === 'casefile' || this.screen === 'kiosk')) {
        this.resume();
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.gestures.cancelAll(); });
  }

  // ----------------------------------------------------------- HUD

  private buildHud(): void {
    this.hud = el('div', 'hud');
    this.hud.innerHTML = `
      <div class="hud-top">
        <div class="tape clock-plate">
          <div class="clock" data-k="clock">23:12</div>
          <div class="where" data-k="where">Kettle Street</div>
        </div>
        <div class="hud-mid">
          <div class="alert-chip" data-k="alert" hidden></div>
          <div class="gaze" data-k="gaze" aria-hidden="true"><span></span></div>
        </div>
        <div class="hud-right">
          <div class="tape cash" data-k="cash" aria-label="Cash">$6</div>
          <button class="tape icon-btn" data-act="casefile" aria-label="Case file">${FOLDER_SVG}</button>
          <button class="tape icon-btn" data-act="pause" aria-label="Pause">${PAUSE_SVG}</button>
        </div>
      </div>
      <p class="lead" data-k="lead" aria-live="polite"></p>
      <div class="toasts" aria-live="polite"></div>
      <div class="stick" data-k="stick" aria-hidden="true"><div class="stick-base"></div><div class="stick-tip"></div></div>
      <div class="hud-bottom">
        <div class="help" data-k="help">${touchDevice ? 'Drag anywhere to move. Push to the rim to run, a little to creep. Pinch to zoom.' : 'WASD to move. Shift runs, C creeps. E acts, H hood, Tab case file. Scroll to zoom.'}</div>
        <div class="act-col">
          <button class="plate act act-2" data-act="a1" hidden></button>
          <button class="plate act act-1" data-act="a0" hidden></button>
          <button class="plate plate-quiet hood" data-act="hood">Hood up</button>
        </div>
      </div>`;
    this.ui.appendChild(this.hud);
    this.hud.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!b || this.screen !== 'play') return;
      this.audio.unlock();
      const a = b.dataset.act!;
      if (a === 'pause') this.pause();
      else if (a === 'casefile') this.openCaseFile();
      else if (a === 'hood') this.hoodQueued = true;
      else if (a === 'a0') this.act(0);
      else if (a === 'a1') this.act(1);
    });
    this.hud.hidden = true;
  }

  private setHud(key: string, value: string, fn: (node: HTMLElement) => void): void {
    if (this.lastHud.get(key) === value) return;
    this.lastHud.set(key, value);
    const node = this.hud.querySelector(`[data-k="${key}"],[data-act="${key}"]`) as HTMLElement | null;
    if (node) fn(node);
  }

  private updateHud(): void {
    if (this.screen === 'title' || this.screen === 'report') return;
    const s = this.sim, p = s.player;
    this.setHud('clock', clockLabel(s.t), (n) => (n.textContent = clockLabel(s.t)));
    const zone = s.world.zoneAt(p.pos);
    const where = zone ? zone.name : 'Kettle Street';
    this.setHud('where', where + (zone?.restricted ? ' · no entry' : ''), (n) => { n.textContent = where; n.dataset.restricted = String(!!zone?.restricted); });
    this.setHud('cash', `$${p.cash}`, (n) => (n.textContent = `$${p.cash}`));
    this.setHud('alert', String(s.alert), (n) => { n.hidden = s.alert === 0; n.textContent = ALERT_NAMES[s.alert]; n.dataset.level = String(s.alert); });
    const gaze = Math.round(Math.min(1, s.exposure) * 20) / 20;
    this.setHud('gaze', String(gaze), (n) => { n.style.setProperty('--g', String(gaze)); n.dataset.hot = String(gaze > 0.45); });
    const leadText = lead(s);
    this.setHud('lead', leadText, (n) => {
      n.textContent = leadText; n.hidden = !leadText;
      // A new lead reads in full, then folds to one line out of the way.
      n.classList.remove('quiet');
      clearTimeout(this.leadTimer);
      this.leadTimer = window.setTimeout(() => n.classList.add('quiet'), 7000);
    });
    this.setHud('hood', String(p.look.hood), (n) => (n.textContent = p.look.hood ? 'Hood down' : 'Hood up'));
    if (this.moved > 6) this.setHud('help', 'hide', (n) => n.classList.add('gone'));
    for (let i = 0; i < 2; i++) {
      const a = this.actions[i];
      const key = a ? `${a.id}|${a.label}|${a.tone ?? ''}` : 'none';
      this.setHud(`a${i}`, key, (n) => {
        n.hidden = !a;
        if (!a) return;
        n.innerHTML = `<span class="act-label">${esc(a.label)}</span>${a.detail ? `<span class="act-detail">${esc(a.detail)}</span>` : ''}${a.tone ? `<span class="act-tone">${a.tone === 'good' ? 'Clear' : a.tone === 'risky' ? 'Risky' : 'Watched'}</span>` : ''}`;
        n.dataset.tone = a.tone ?? '';
      });
    }
    // The floating stick, drawn where the thumb is.
    const g = this.gestures;
    const stick = this.hud.querySelector('[data-k="stick"]') as HTMLElement;
    if (g.active && this.screen === 'play') {
      stick.style.display = 'block';
      stick.style.setProperty('--bx', `${g.base.x}px`);
      stick.style.setProperty('--by', `${g.base.y}px`);
      const v = g.vector();
      stick.style.setProperty('--tx', `${g.base.x + v.x * STICK_RADIUS}px`);
      stick.style.setProperty('--ty', `${g.base.y + v.y * STICK_RADIUS}px`);
    } else stick.style.display = 'none';
  }

  private toast(text: string, tone: string): void {
    const box = this.hud.querySelector('.toasts')!;
    const t = el('div', `toast toast-${tone}`);
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild!.remove();
    setTimeout(() => t.classList.add('out'), 3600);
    setTimeout(() => t.remove(), 4200);
  }

  // ----------------------------------------------------------- verbs

  private act(i: number): void {
    const a = this.actions[i];
    if (!a || this.screen !== 'play') return;
    const [verb, arg] = a.id.split(':');
    if (verb === 'lift' || verb === 'plant') return this.startDip(arg, verb);
    const panel = this.sim.perform(a.id);
    this.audio.cue('tap');
    if (panel === 'kiosk') this.openKiosk();
  }

  private startDip(target: string, mode: 'lift' | 'plant'): void {
    const setup = this.sim.liftSetup(target, mode);
    if (!setup) return;
    this.gestures.cancelAll();
    this.keys.clear();
    this.screen = 'dip';
    this.hud.hidden = true;
    const ag = this.sim.agent(target)!;
    const who = target === 'pell' ? 'Pell' : ag.spec.name.split(' ')[0];
    const title = mode === 'plant' ? `Putting it back · ${who}` : `${who} · ${setup.label === 'good' ? 'nobody watching' : setup.label === 'risky' ? 'someone could look' : 'you are being watched'}`;
    this.dip = new DipView(this.ui, {
      mode, pocket: setup.pocket, item: setup.item, start: setup.start, glanceMul: setup.glanceMul,
      aware: setup.aware, stir: setup.stir, crowdCover: setup.crowdCover, seed: (this.sim.tick * 2654435761) >>> 0,
    }, title, ag.spec.look.coat, this.audio, this.reducedMotion, (r) => this.endDip(setup, r));
  }

  private endDip(setup: LiftSetup, r: { success: boolean; aborted?: boolean; quality?: 'critical' | 'clean' | 'sloppy' }): void {
    this.dip = null;
    this.sim.resolveLift(setup, r);
    if (!r.success && !r.aborted) this.audio.cue('fumble');
    this.screen = 'play';
    this.hud.hidden = false;
    this.sim.bus.flush();
  }

  // ----------------------------------------------------------- panels

  private openPanel(cls: string, html: string, screen: Screen): HTMLElement {
    this.closePanel();
    this.gestures.cancelAll();
    this.keys.clear();
    const p = el('div', `panel ${cls}`);
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    p.innerHTML = html;
    this.ui.appendChild(p);
    this.panel = p;
    this.screen = screen;
    if (!touchDevice) (p.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true });
    return p;
  }

  private closePanel(): void { this.panel?.remove(); this.panel = null; }

  private resume(): void {
    this.closePanel();
    this.screen = 'play';
    this.hud.hidden = false;
  }

  private pause(): void {
    if (this.screen !== 'play') return;
    const s = this.save.settings;
    const p = this.openPanel('pause', `
      <div class="sheet">
        <h2 class="display">Paused</h2>
        <p class="typed">${clockLabel(this.sim.t)}, Calder Central. The Night Mail leaves at 23:46.</p>
        <div class="stack">
          <button class="plate" data-p="resume">Back to the station</button>
          <button class="plate plate-quiet" data-p="casefile">Case file</button>
          <label class="toggle"><input type="checkbox" data-p="sound" ${s.sound ? 'checked' : ''}/> <span>Sound</span></label>
          <label class="toggle"><input type="checkbox" data-p="motion" ${s.reducedMotion ? 'checked' : ''}/> <span>Reduce motion</span></label>
          <button class="plate plate-quiet" data-p="restart">Start the night again</button>
          <button class="plate plate-quiet" data-p="title">Quit to title</button>
        </div>
        <p class="credit" data-haveanapp>by HaveAnApp</p>
      </div>`, 'paused');
    p.addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).closest('[data-p]') as HTMLElement | null;
      if (!k) return;
      const v = k.dataset.p;
      if (v === 'resume') this.resume();
      if (v === 'casefile') this.openCaseFile();
      if (v === 'restart') this.newNight(false);
      if (v === 'title') { this.closePanel(); this.newNight(false); this.showTitle(); }
    });
    p.addEventListener('change', (e) => {
      const i = e.target as HTMLInputElement;
      if (i.dataset.p === 'sound') { this.save.settings.sound = i.checked; this.audio.setMuted(!i.checked); }
      if (i.dataset.p === 'motion') { this.save.settings.reducedMotion = i.checked; this.renderer.reducedMotion = this.reducedMotion; }
      store(this.save);
    });
  }

  private openCaseFile(): void {
    if (this.screen !== 'play' && this.screen !== 'paused') return;
    const s = this.sim;
    const groups: Array<[string, (f: Fact) => boolean]> = [
      ['The card', (f) => f.kind === 'card' || f.kind === 'person'],
      ['Cameras', (f) => f.kind === 'camera'],
      ['Rounds and power', (f) => f.kind === 'route' || f.kind === 'circuit'],
      ['Bought from Dee', (f) => f.kind === 'tip'],
    ];
    const facts = [...s.facts.values()];
    const learned = facts.filter((f) => f.status === 'confirmed' || f.status === 'false').length;
    const card = (f: Fact) => `
      <li class="fact" data-status="${f.status}">
        <div class="fact-head"><span class="fact-title">${esc(f.title)}</span><span class="stamp" data-status="${f.status}">${STATUS_LABEL[f.status]}</span></div>
        <p class="typed">${f.status === 'unknown' && f.kind === 'tip' ? 'Dee will sell this for $10.' : esc(f.text)}</p>
        ${f.status === 'observing' ? `<div class="progress" style="--p:${f.progress}"></div>` : ''}
      </li>`;
    const p = this.openPanel('casefile', `
      <div class="sheet manila">
        <div class="file-head">
          <div>
            <div class="label">Case file</div>
            <h2 class="display">The Night Mail</h2>
          </div>
          <button class="plate plate-quiet" data-p="close" aria-label="Close the case file">Close</button>
        </div>
        <p class="typed summary">${learned} of ${facts.length} learned. ${clockLabel(s.t)}. Heat carried in: ${s.carry.heat}.</p>
        <div class="scroll file-body">
          ${groups.map(([name, pred]) => `<h3 class="label">${name}</h3><ul class="facts">${facts.filter(pred).map(card).join('')}</ul>`).join('')}
        </div>
      </div>`, 'casefile');
    p.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-p="close"]') || e.target === p) this.resume();
    });
  }

  private openKiosk(): void {
    const s = this.sim, p = s.player;
    const tips = TIPS.map((tip) => {
      const f = s.facts.get(tip.id)!;
      const owned = f.status !== 'unknown';
      return `<li class="offer">
        <div><div class="offer-title">${owned ? esc(tip.text) : esc(tip.teaser)}</div>
        <div class="typed small">${owned ? `Bought. ${STATUS_LABEL[f.status]}.` : `$${tip.price}. Dee swears it's good.`}</div></div>
        <button class="plate" data-buy="${tip.id}" ${owned || p.cash < tip.price ? 'disabled' : ''}>${owned ? 'Bought' : `$${tip.price}`}</button>
      </li>`;
    }).join('');
    const canCopy = p.card === 'original' && p.clone === 'none';
    const copy = canCopy ? `<li class="offer">
        <div><div class="offer-title">Copy the coach card</div><div class="typed small">$${PRICES.copy}. Two minutes on the skimmer. You get both back.</div></div>
        <button class="plate" data-copy ${p.cash < PRICES.copy ? 'disabled' : ''}>$${PRICES.copy}</button>
      </li>` : '';
    const panel = this.openPanel('kiosk', `
      <div class="sheet">
        <div class="file-head">
          <div><div class="label">Dee's, concourse</div><h2 class="display">"Buying or browsing?"</h2></div>
          <button class="plate plate-quiet" data-p="close">Leave</button>
        </div>
        <p class="typed">You have $${p.cash}. Dee sells what she hears. Some of it is even true.</p>
        <ul class="offers">${copy}${tips}</ul>
      </div>`, 'kiosk');
    panel.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-p="close"]') || t === panel) return this.resume();
      const buy = t.closest('[data-buy]') as HTMLElement | null;
      if (buy && s.buyTip(buy.dataset.buy!)) { this.audio.cue('buy'); s.bus.flush(); this.openKiosk(); }
      if (t.closest('[data-copy]') && s.startCopy()) { this.audio.cue('buy'); s.bus.flush(); this.resume(); }
    });
  }

  // ----------------------------------------------------------- title and report

  private showTitle(): void {
    this.screen = 'title';
    this.hud.hidden = true;
    const last = this.save.last;
    const p = this.openPanel('title', `
      <div class="title-wrap">
        <h1 class="wordmark" aria-label="BLINDSPOT"><span>BLIND</span><span class="redact">SPOT</span></h1>
        <p class="premise">Calder Central, 23:12. The Night Mail leaves at 23:46, and its last coach belongs to Halvard Trust. Somebody carries the coach card in. Find them, find the gaps, and walk away clean.</p>
        <div class="stack narrow">
          <button class="plate plate-big" data-p="play">${this.save.nights ? 'Case it again' : 'Case the station'}</button>
          <button class="plate plate-quiet" data-p="how">How it plays</button>
        </div>
        <div class="how typed" hidden>
          <p><b>Watch.</b> Stay near a camera for a full sweep and you learn its gaps. Follow a guard round and you learn his route. What you know is drawn in blue.</p>
          <p><b>Lift.</b> Get close behind someone and take what's in their pocket with your finger. Slowly. When they stir, freeze.</p>
          <p><b>Be nobody.</b> Running, sneaking up on people, jumping the gates and staff-only doors give people a reason. Cameras and guards only act on a reason. Light takes away cover; crowds give it.</p>
        </div>
        ${last ? `<p class="typed small last">Last night: ${esc(last.reason === 'caught' ? 'detained' : last.reason === 'left' ? 'walked out' : 'the Night Mail left')} at ${esc(last.endedAt)}. ${last.learned} of ${last.total} learned. Copy of the card: ${last.clone}. Heat ${last.heat}.</p>` : ''}
        <p class="credit" data-haveanapp>by HaveAnApp</p>
      </div>`, 'title');
    this.screen = 'title';
    p.addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).closest('[data-p]') as HTMLElement | null;
      if (!k) return;
      this.audio.unlock();
      if (k.dataset.p === 'play') this.begin();
      if (k.dataset.p === 'how') { const h = p.querySelector('.how') as HTMLElement; h.hidden = !h.hidden; }
    });
  }

  private begin(): void {
    this.closePanel();
    this.screen = 'play';
    this.hud.hidden = false;
    this.lastHud.clear();
    this.moved = this.save.seenHelp ? 99 : 0;
    this.save.seenHelp = true;
    store(this.save);
  }

  private newNight(start: boolean): void {
    this.dip?.close();
    this.dip = null;
    this.sim = new Sim(this.seedFor(this.save.nights), this.save.carry);
    this.bindSim();
    this.renderer.cam = { x: 0, y: 0 };
    this.hud.querySelector('.toasts')!.innerHTML = '';
    if (start) this.begin();
    else if (this.screen !== 'title') { this.closePanel(); this.screen = 'play'; this.hud.hidden = false; this.lastHud.clear(); }
  }

  private showReport(): void {
    if (this.screen === 'report') return;
    this.dip?.close();
    this.dip = null;
    this.save.nights++;
    const { report, carry } = nightReport(this.sim, this.save.nights);
    this.save.carry = carry;
    this.save.last = report;
    store(this.save);
    this.hud.hidden = true;
    const reason = report.reason === 'caught' ? `Detained at ${report.endedAt}.` : report.reason === 'left' ? `You walked out onto Kettle Street at ${report.endedAt}.` : 'The Night Mail left at 23:46.';
    const cloneLine = report.clone === 'live'
      ? `A working copy of the coach card${report.reader ? ', tested on the coach door' : ', untested'}. Pell never knew.`
      : report.clone === 'revoked' ? 'You had a copy of the card. Halvard cancelled it.' : 'No copy of the coach card.';
    const p = this.openPanel('report', `
      <div class="sheet manila report-sheet">
        <div class="label">Night report · Calder Central · night ${report.night}</div>
        <h2 class="display">${report.reason === 'caught' ? 'Detained' : report.clone === 'live' ? 'The card is yours' : 'Night over'}</h2>
        <p class="typed">${esc(reason)}</p>
        <div class="scroll file-body">
          <h3 class="label">The card</h3>
          <p class="typed"><span class="stamp" data-status="${report.clone === 'live' ? 'confirmed' : report.clone === 'revoked' ? 'dead' : 'unknown'}">${report.clone === 'live' ? 'Live' : report.clone === 'revoked' ? 'Cancelled' : 'None'}</span> ${esc(cloneLine)}</p>
          <h3 class="label">What you learned</h3>
          <p class="typed">${report.learned} of ${report.total} entries in the case file.</p>
          <ul class="facts compact">${report.facts.filter((f) => f.status === 'confirmed' || f.status === 'false' || f.status === 'dead').map((f) => `<li class="fact"><div class="fact-head"><span class="fact-title">${esc(f.title)}</span><span class="stamp" data-status="${f.status}">${STATUS_LABEL[f.status as Fact['status']]}</span></div></li>`).join('')}</ul>
          <h3 class="label">Takings</h3>
          <p class="typed">$${report.takes} lifted tonight. $${report.cash} in your pocket.</p>
          <h3 class="label">What Calder remembers</h3>
          <p class="typed">Heat ${report.heat} (${report.nightHeat} from tonight). ${report.witnesses} ${report.witnesses === 1 ? 'person' : 'people'} could describe you.</p>
          <ul class="consequences">${report.consequences.map((c) => `<li class="typed">${esc(c)}</li>`).join('')}</ul>
          <p class="typed small next">The job itself, boarding the Night Mail with a crew, is the next part of BLINDSPOT to be built. What you learned tonight is saved for it.</p>
        </div>
        <div class="stack row">
          <button class="plate" data-p="again">Case it again</button>
          <button class="plate plate-quiet" data-p="title">Title</button>
        </div>
      </div>`, 'report');
    p.addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).closest('[data-p]') as HTMLElement | null;
      if (!k) return;
      if (k.dataset.p === 'again') this.newNight(true);
      if (k.dataset.p === 'title') { this.newNight(false); this.showTitle(); }
    });
  }
}

const FOLDER_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"/><path d="M7 13h10" stroke="currentColor" stroke-width="2"/></svg>';
const PAUSE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3"/></svg>';

void TICK_DT;
const game = new Game();
// QA hook for the browser checks: only with ?qa in the URL.
if (new URLSearchParams(location.search).has('qa')) (window as unknown as { __game: unknown }).__game = game;
