/**
 * The Dip, on screen. Owns a full-screen canvas while a lift is in progress,
 * turns pointer input into design-space coordinates for the pure Dip model,
 * and draws the pocket, the hand and the mark's eye.
 */
import { clamp } from '../core/math';
import { COAT_SPOT, Dip, GRIP_TIME, itemPoint, type DipOptions, type DipResult } from '../theft/dip';
import { PAL } from '../render/palette';
import type { Audio } from '../audio/audio';

export class DipView {
  private cv: HTMLCanvasElement;
  private c: CanvasRenderingContext2D;
  private root: HTMLElement;
  private dip: Dip;
  private raf = 0;
  private last = 0;
  private k = 1; private ox = 0; private oy = 0; private W = 0; private H = 0; private dpr = 1;
  private pointerId: number | null = null;
  private status: HTMLElement;
  private hintEl: HTMLElement;

  constructor(
    host: HTMLElement,
    opts: DipOptions,
    title: string,
    private coat: string,
    private audio: Audio,
    private reducedMotion: boolean,
    private onDone: (r: DipResult) => void,
  ) {
    this.dip = new Dip(opts);
    this.root = document.createElement('div');
    this.root.className = 'dip';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', `${opts.mode === 'plant' ? 'Planting' : 'Lifting'}: ${title}`);
    this.root.innerHTML = `
      <div class="dip-head">
        <div class="dip-title">${title}</div>
        <div class="dip-status" aria-live="polite"></div>
      </div>
      <canvas class="dip-canvas" aria-hidden="true"></canvas>
      <div class="dip-foot">
        <p class="dip-hint"></p>
        <button class="plate plate-quiet dip-abort" type="button">Pull out</button>
      </div>`;
    host.appendChild(this.root);
    this.cv = this.root.querySelector('canvas')!;
    this.c = this.cv.getContext('2d')!;
    this.status = this.root.querySelector('.dip-status')!;
    this.hintEl = this.root.querySelector('.dip-hint')!;
    this.root.querySelector('.dip-abort')!.addEventListener('click', () => this.dip.abort());
    this.cv.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('resize', this.layout);
    this.layout();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private layout = (): void => {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(r.width * this.dpr);
    this.cv.height = Math.round(r.height * this.dpr);
    const size = Math.min(this.W - 16, this.H - 8, 560);
    this.k = size / 400;
    this.ox = (this.W - size) / 2;
    this.oy = (this.H - size) / 2;
  };

  private toDesign(e: PointerEvent): [number, number] {
    const r = this.cv.getBoundingClientRect();
    return [(e.clientX - r.left - this.ox) / this.k, (e.clientY - r.top - this.oy) / this.k];
  }

  private down = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    const [x, y] = this.toDesign(e);
    this.dip.pointerDown(x, y);
  };
  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const [x, y] = this.toDesign(e);
    this.dip.pointerMove(x, y);
  };
  private up = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.dip.pointerUp();
  };

  private frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.dip.update(dt);
    for (const cue of this.dip.cues) this.audio.cue(cue);
    this.draw();
    const d = this.dip;
    const status = d.glance > 0 ? 'They look round. Freeze.' : d.stir > 0 ? 'They stir.' : d.coverT > 0 ? 'Someone brushes past. Move now.' : '';
    if (this.status.textContent !== status) this.status.textContent = status;
    this.status.dataset.tone = d.glance > 0 ? 'bad' : d.coverT > 0 ? 'good' : 'warn';
    if (this.hintEl.textContent !== d.hint) this.hintEl.textContent = d.hint;
    if (d.done && d.result) { this.close(); this.onDone(d.result); return; }
    this.raf = requestAnimationFrame(this.frame);
  };

  close(): void {
    cancelAnimationFrame(this.raf);
    this.cv.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    window.removeEventListener('resize', this.layout);
    this.root.remove();
  }

  // -------------------------------------------------------------- drawing

  private draw(): void {
    const c = this.c, d = this.dip, P = d.P;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.W, this.H);
    c.save();
    c.translate(this.ox, this.oy);
    c.scale(this.k, this.k);
    c.save();
    c.beginPath(); c.rect(0, 0, 400, 400); c.clip();
    // Their coat, close up: weave and a seam.
    c.fillStyle = this.coat;
    c.fillRect(0, 0, 400, 400);
    c.globalAlpha = 0.14;
    c.strokeStyle = '#000';
    c.lineWidth = 1;
    for (let y = 0; y < 400; y += 5) { c.beginPath(); c.moveTo(0, y); c.lineTo(400, y + 3); c.stroke(); }
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, 0, 46, 400);
    if (P.bag) {
      c.fillStyle = '#3a2a22';
      c.fillRect(70, 120, 260, 260);
      c.fillStyle = '#2a1e18';
      c.fillRect(70, 120, 260, 18);
    }
    // The pocket, in x-ray.
    c.save();
    c.translate(P.cx, P.cy); c.rotate(P.a);
    const hw0 = d.halfW(0), hwd = d.halfW(P.d);
    c.beginPath();
    c.moveTo(-hw0, 0); c.lineTo(hw0, 0); c.lineTo(hwd, P.d); c.lineTo(-hwd, P.d); c.closePath();
    c.fillStyle = 'rgba(14,13,12,0.55)';
    c.fill();
    c.save(); c.clip();
    c.strokeStyle = `rgba(242,193,78,0.18)`;
    c.lineWidth = d.tol * 2;
    c.beginPath(); c.moveTo(-hw0, 0); c.lineTo(-hwd, P.d); c.lineTo(hwd, P.d); c.lineTo(hw0, 0); c.stroke();
    c.restore();
    c.setLineDash([5, 4]); c.strokeStyle = 'rgba(235,227,210,0.6)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(-hw0, 0); c.lineTo(-hwd, P.d); c.lineTo(hwd, P.d); c.lineTo(hw0, 0); c.stroke();
    c.setLineDash([]);
    if (d.pen > 0.05) {
      c.strokeStyle = `rgba(232,67,44,${Math.min(1, d.pen)})`; c.lineWidth = 5;
      c.beginPath();
      if (d.lastWall === 'L') { c.moveTo(-hw0, 0); c.lineTo(-hwd, P.d); }
      else if (d.lastWall === 'R') { c.moveTo(hw0, 0); c.lineTo(hwd, P.d); }
      else { c.moveTo(-hwd, P.d); c.lineTo(hwd, P.d); }
      c.stroke();
    }
    // The mouth of the pocket.
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(-hw0 - 6, -7, hw0 * 2 + 12, 8);
    c.restore();

    // The item, or where it goes.
    const ip = itemPoint(d);
    const showItem = d.o.mode === 'lift' ? !d.gripped : d.placed;
    if (showItem) drawItem(c, d.o.item, ip.x, ip.y);
    if (d.o.mode === 'plant' && !d.placed) {
      c.strokeStyle = PAL.known; c.setLineDash([4, 4]); c.lineWidth = 2;
      c.beginPath(); c.arc(ip.x, ip.y, d.itemR + 10, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    }
    if (d.gripT > 0 && !(d.o.mode === 'lift' ? d.gripped : d.placed)) {
      c.strokeStyle = PAL.good; c.lineWidth = 4;
      c.beginPath(); c.arc(ip.x, ip.y, d.itemR + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(d.gripT / GRIP_TIME, 0, 1)); c.stroke();
    }
    // Your jacket, where the take goes.
    if (d.extracted) {
      const pulse = this.reducedMotion ? 0 : Math.sin(d.t * 6) * 3;
      c.strokeStyle = PAL.good; c.lineWidth = 2.5; c.setLineDash([6, 4]);
      c.beginPath(); c.arc(COAT_SPOT.x, COAT_SPOT.y, COAT_SPOT.r - 4 + pulse, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = PAL.paper; c.font = '700 13px "Big Shoulders Text", sans-serif'; c.textAlign = 'center';
      c.fillText('YOUR JACKET', COAT_SPOT.x, COAT_SPOT.y + 5);
    }
    if (d.gripped) drawItem(c, d.o.item, d.hx + 4, d.hy + 6);
    // The hand.
    const tense = d.hv > d.speedLim * 0.9 && d.inside;
    drawHand(c, d.hx, d.hy, tense);
    if (d.inside) {
      c.strokeStyle = tense ? PAL.signal : d.pen > 0.3 ? PAL.attention : 'rgba(156,194,126,0.8)';
      c.lineWidth = 2; c.beginPath(); c.arc(d.hx, d.hy, 10, 0, Math.PI * 2); c.stroke();
    }
    // Hand speed.
    if (d.inside || d.extracted) {
      const v = clamp(d.hv / (d.speedLim * 1.6), 0, 1);
      c.fillStyle = 'rgba(14,13,12,0.7)'; c.fillRect(376, 60, 12, 200);
      c.fillStyle = v > 0.62 ? PAL.signal : v > 0.45 ? PAL.attention : PAL.good;
      c.fillRect(376, 260 - 200 * v, 12, 200 * v);
      c.fillStyle = PAL.paper; c.fillRect(372, 260 - 200 * 0.62, 20, 2);
    }
    // The glance: the edges go red.
    if (d.stir > 0 || d.glance > 0) {
      const a = d.glance > 0 ? 0.38 : 0.16;
      const g = c.createRadialGradient(200, 200, 130, 200, 200, 300);
      g.addColorStop(0, 'rgba(232,67,44,0)'); g.addColorStop(1, `rgba(232,67,44,${a})`);
      c.fillStyle = g; c.fillRect(0, 0, 400, 400);
    }
    if (d.coverT > 0) { c.fillStyle = `rgba(14,13,12,${0.25 * Math.min(1, d.coverT)})`; c.fillRect(0, 0, 400, 400); }
    c.restore();
    // Frame.
    c.strokeStyle = PAL.paper; c.lineWidth = 2; c.strokeRect(0, 0, 400, 400);
    // Message.
    if (d.msgT > 0 && d.msg) {
      c.globalAlpha = Math.min(1, d.msgT * 2);
      c.font = '800 34px "Big Shoulders Display", sans-serif'; c.textAlign = 'center';
      c.fillStyle = d.msg === 'Freeze.' || d.msg === 'The lining.' ? PAL.signal : PAL.paper;
      c.fillText(d.msg.toUpperCase(), 200, 214);
      c.globalAlpha = 1;
    }
    c.restore();
    // Their awareness: an eye that opens, top centre.
    this.eye(d);
  }

  private eye(d: Dip): void {
    const c = this.c;
    const ex = this.W / 2, ey = Math.max(24, this.oy - 30);
    const aw = d.aw / 100;
    const open = d.glance > 0 ? 1 : d.stir > 0 ? 0.6 : Math.max(0.12, aw * 0.9);
    const col = aw > 0.7 ? PAL.signal : aw > 0.4 ? PAL.attention : PAL.paper;
    c.save();
    c.translate(ex, ey);
    c.fillStyle = 'rgba(14,13,12,0.9)';
    c.beginPath(); c.ellipse(0, 0, 38, 20, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = col; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(-28, 0); c.quadraticCurveTo(0, -24 * open, 28, 0); c.quadraticCurveTo(0, 24 * open, -28, 0); c.closePath(); c.stroke();
    c.save(); c.clip(); c.fillStyle = col; c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill(); c.restore();
    c.strokeStyle = 'rgba(235,227,210,0.15)'; c.lineWidth = 4;
    c.beginPath(); c.arc(0, 0, 30, Math.PI * 0.85, Math.PI * 2.15); c.stroke();
    c.strokeStyle = col;
    c.beginPath(); c.arc(0, 0, 30, Math.PI * 0.85, Math.PI * 0.85 + Math.PI * 1.3 * aw); c.stroke();
    c.restore();
  }
}

function drawItem(c: CanvasRenderingContext2D, kind: 'cash' | 'phone' | 'card', x: number, y: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(0.2);
  if (kind === 'card') {
    c.fillStyle = '#e9e4d8'; c.fillRect(-22, -14, 44, 28);
    c.fillStyle = '#1f3a30'; c.fillRect(-22, -14, 44, 9);
    c.fillStyle = '#c9a33e'; c.fillRect(-16, 0, 9, 7);
  } else if (kind === 'phone') {
    c.fillStyle = '#1a1c1f'; c.fillRect(-13, -24, 26, 48);
    c.fillStyle = '#3d5566'; c.fillRect(-10, -20, 20, 38);
  } else {
    c.fillStyle = '#6f7d62'; c.fillRect(-24, -12, 48, 24);
    c.fillStyle = '#879777'; c.fillRect(-22, -10, 44, 20);
    c.strokeStyle = '#4f5a46'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 6, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
}

function drawHand(c: CanvasRenderingContext2D, x: number, y: number, tense: boolean): void {
  c.save();
  c.translate(x, y);
  c.rotate(-0.65);
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.ellipse(6, 50, 18, 40, 0, 0, Math.PI * 2); c.fill();
  // Wren's sleeve: the pale jacket.
  c.fillStyle = PAL.wren; c.fillRect(-16, 58, 36, 130);
  c.fillStyle = '#b8b2a4'; c.fillRect(-16, 56, 36, 6);
  const skin = tense ? '#8a5a44' : '#9a6a4c';
  c.fillStyle = skin;
  c.beginPath(); c.ellipse(2, 36, 15, 20, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.roundRect(-6, -2, 7, 34, 3.5); c.fill();
  c.beginPath(); c.roundRect(2, 2, 7, 32, 3.5); c.fill();
  c.beginPath(); c.roundRect(10, 16, 6, 22, 3); c.fill();
  c.beginPath(); c.ellipse(-12, 34, 5, 11, -0.6, 0, Math.PI * 2); c.fill();
  c.restore();
}
