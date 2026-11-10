/**
 * People seen from above: legs that stride, arms that swing, shoulders under
 * a coat, a head with hair or a hat, and what they carry. From LIFT's
 * parametric figures (look -> drawing), redrawn for an overhead camera and
 * drawn larger than life so a person reads at a glance on a phone.
 */
import type { Agent } from '../sim/agents';
import type { Player } from '../sim/sim';
import type { Light } from '../sim/types';
import { PAL } from './palette';

const FIG = 1.55;

/** A soft shadow on the floor, thrown away from the nearest lamp. */
export function drawPersonShadow(ctx: CanvasRenderingContext2D, x: number, y: number, light: Light | null): void {
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath(); ctx.ellipse(x, y + 0.05, 0.42, 0.3, 0, 0, Math.PI * 2); ctx.fill();
  if (!light) return;
  const dx = x - light.x, dy = y - light.y, d = Math.hypot(dx, dy) || 1;
  const len = Math.min(1.8, 0.5 + d * 0.22);
  ctx.save();
  ctx.translate(x + (dx / d) * len * 0.55, y + (dy / d) * len * 0.55);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = `rgba(0,0,0,${0.24 * Math.max(0.3, light.strength)})`;
  ctx.beginPath(); ctx.ellipse(0, 0, len * 0.6, 0.24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

interface Body {
  coat: string; skin: string; hair: string; build: number;
  hat?: 'cap' | 'beanie' | 'brim' | 'hood';
  bag?: 'backpack' | 'case' | 'tote' | 'suitcase' | 'board';
  long?: boolean;
  held?: 'phone' | 'paper' | 'cup' | null;
}

/** One person, in local space: +x is the way they face. */
function body(ctx: CanvasRenderingContext2D, b: Body, stride: number, crouch: number, scale: number, outline: string): void {
  const bw = 0.27 * b.build * crouch, bd = 0.15 * crouch;
  const line = 1.6 / (scale * FIG);
  // Legs, stepping.
  if (stride !== 0) {
    ctx.fillStyle = '#121110';
    ctx.beginPath(); ctx.ellipse(stride * 0.22, -0.1, 0.12, 0.06, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-stride * 0.22, 0.1, 0.12, 0.06, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Long coats show a hem behind the shoulders.
  if (b.long) {
    ctx.fillStyle = shadeHex(b.coat, -0.25);
    ctx.beginPath(); ctx.ellipse(-0.08, 0, bd + 0.05, bw * 0.88, 0, 0, Math.PI * 2); ctx.fill();
  }
  // What they carry, on the back or at the side.
  if (b.bag === 'backpack') { ctx.fillStyle = shadeHex(b.coat, -0.4); ctx.fillRect(-bd - 0.15, -0.16, 0.17, 0.32); }
  if (b.bag === 'board') {
    ctx.fillStyle = PAL.wrenBoard;
    ctx.beginPath(); ctx.ellipse(-bd - 0.05, 0, 0.08, 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#211d19'; ctx.fillRect(-bd - 0.09, -0.33, 0.08, 0.05); ctx.fillRect(-bd - 0.09, 0.28, 0.08, 0.05);
  }
  // Arms, swinging against the stride.
  const armY = bw + 0.02;
  ctx.fillStyle = shadeHex(b.coat, -0.12);
  ctx.beginPath(); ctx.ellipse(-stride * 0.12, -armY, 0.13, 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(stride * 0.12, armY, 0.13, 0.07, 0, 0, Math.PI * 2); ctx.fill();
  if (b.bag === 'suitcase') { ctx.fillStyle = '#2a2622'; ctx.fillRect(-0.32, armY + 0.04, 0.5, 0.18); }
  if (b.bag === 'case') { ctx.fillStyle = '#16130f'; ctx.fillRect(-0.06, armY + 0.04, 0.34, 0.11); ctx.fillStyle = '#c9a33e'; ctx.fillRect(0.08, armY + 0.04, 0.05, 0.02); }
  if (b.bag === 'tote') { ctx.fillStyle = '#6b5a44'; ctx.fillRect(-0.14, -armY - 0.18, 0.26, 0.15); }
  // Shoulders.
  ctx.fillStyle = b.coat;
  ctx.beginPath(); ctx.ellipse(0, 0, bd, bw, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = outline; ctx.lineWidth = line; ctx.stroke();
  // A lit edge on the shoulders' leading side.
  ctx.strokeStyle = 'rgba(255,240,215,0.18)'; ctx.lineWidth = line * 1.2;
  ctx.beginPath(); ctx.ellipse(0, 0, bd, bw, 0, -1.1, 1.1); ctx.stroke();
  // Held in front.
  if (b.held === 'phone') { ctx.fillStyle = '#a8d0e8'; ctx.fillRect(0.2, -0.05, 0.06, 0.1); }
  if (b.held === 'paper') { ctx.fillStyle = PAL.paper; ctx.fillRect(0.17, -0.15, 0.09, 0.3); }
  if (b.held === 'cup') { ctx.fillStyle = '#d8cfba'; ctx.beginPath(); ctx.arc(0.22, 0.13, 0.05, 0, Math.PI * 2); ctx.fill(); }
  // Head.
  if (b.hat === 'hood') {
    ctx.fillStyle = shadeHex(b.coat, -0.08);
    ctx.beginPath(); ctx.arc(-0.01, 0, 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = line; ctx.stroke();
    ctx.fillStyle = '#1d1915';
    ctx.beginPath(); ctx.arc(0.08, 0, 0.085, -1.2, 1.2); ctx.fill();
  } else {
    ctx.fillStyle = b.hair;
    ctx.beginPath(); ctx.arc(0.01, 0, 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = b.skin;
    ctx.beginPath(); ctx.arc(0.07, 0, 0.075, -1.25, 1.25); ctx.fill();
    if (b.hat === 'cap') { ctx.fillStyle = '#1f2a3f'; ctx.beginPath(); ctx.arc(0.01, 0, 0.135, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(0.08, -0.08, 0.13, 0.16); }
    if (b.hat === 'beanie') { ctx.fillStyle = shadeHex(b.coat, 0.3); ctx.beginPath(); ctx.arc(0, 0, 0.135, Math.PI * 0.5, Math.PI * 1.5); ctx.fill(); }
    if (b.hat === 'brim') {
      ctx.fillStyle = '#211d19'; ctx.beginPath(); ctx.arc(0.01, 0, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2f2a24'; ctx.beginPath(); ctx.arc(0.01, 0, 0.12, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export function drawFigure(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, a: Agent, time: number, scale: number): void {
  const L = a.spec.look;
  const stride = time > 0 ? Math.sin(time * 8.5 + x * 1.7) : 0;
  const held = a.activity === 'phone' ? 'phone' : a.activity === 'read' ? 'paper' : a.activity === 'coffee' ? 'cup' : null;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  ctx.scale(FIG, FIG);
  body(ctx, {
    coat: L.coat, skin: L.skin, hair: L.hair, build: L.build, hat: L.hat, bag: L.bag,
    long: a.spec.role === 'courier' || a.spec.archetype === 'suit' || a.spec.archetype === 'elder', held,
  }, stride, a.activity === 'sleep' ? 0.92 : 1, scale, 'rgba(0,0,0,0.6)');
  // Uniforms carry a mark you can read: a light band for station staff, gold for Halvard.
  if (a.spec.role === 'guard') { ctx.fillStyle = '#c9c2a8'; ctx.fillRect(-0.03, -0.26 * L.build, 0.06, 0.52 * L.build); }
  if (a.spec.faction === 'halvard') { ctx.fillStyle = '#c9a33e'; ctx.fillRect(-0.02, 0.12, 0.05, 0.06); }
  ctx.restore();
  if (a.activity === 'sleep') {
    ctx.strokeStyle = 'rgba(233,226,207,0.55)';
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.arc(x + 0.3, y - 0.45, 0.09, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 0.45, y - 0.65, 0.06, Math.PI, Math.PI * 2); ctx.stroke();
  }
}

/** Wren: the pale jacket, the hood, the rust-orange board across her back. */
export function drawWren(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, p: Player, time: number, scale: number): void {
  const moving = Math.hypot(p.vel.x, p.vel.y) > 0.15;
  const rate = p.gait === 'run' ? 14 : p.gait === 'sneak' ? 5 : 9.5;
  const stride = moving ? Math.sin(time * rate) * (p.gait === 'run' ? 1.25 : 1) : 0;
  ctx.save();
  ctx.translate(x, y);
  // A pale ring at her feet so you never lose her in a crowd.
  ctx.strokeStyle = 'rgba(233,228,216,0.28)';
  ctx.lineWidth = 2 / scale;
  ctx.beginPath(); ctx.ellipse(0, 0.05, 0.62, 0.48, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.rotate(facing);
  ctx.scale(FIG, FIG);
  body(ctx, {
    coat: PAL.wren, skin: '#9a6a4c', hair: '#2a1d16', build: 0.98,
    hat: p.look.hood ? 'hood' : undefined, bag: 'board',
  }, stride, p.gait === 'sneak' ? 0.86 : 1, scale, '#0b0a09');
  ctx.restore();
}
