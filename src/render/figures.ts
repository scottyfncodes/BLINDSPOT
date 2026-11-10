/**
 * People seen from above: shoulders, head, hat, bag, the swing of walking.
 * From LIFT's parametric figures (look -> drawing), redrawn for an overhead
 * camera. Read at a glance by coat colour and silhouette.
 */
import type { Agent } from '../sim/agents';
import type { Player } from '../sim/sim';
import { PAL } from './palette';

/** Figures are drawn at 1.4x: real proportions vanish at phone scale. */
const FIG = 1.4;

export function drawFigure(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, a: Agent, time: number, scale: number): void {
  const L = a.spec.look;
  const bw = 0.29 * L.build, bd = 0.17;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  // Drawn larger than life so a person reads on a phone.
  ctx.scale(FIG, FIG);
  // Feet, swinging when they walk.
  if (time > 0) {
    const sw = Math.sin(time * 9 + x) * 0.16;
    ctx.fillStyle = '#141311';
    ctx.beginPath(); ctx.ellipse(sw, -0.1, 0.1, 0.06, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-sw, 0.1, 0.1, 0.06, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Bag first, on the side it is carried.
  if (L.bag === 'backpack') { ctx.fillStyle = shadeHex(L.coat, -0.35); ctx.fillRect(-bd - 0.16, -0.17, 0.18, 0.34); }
  if (L.bag === 'suitcase') { ctx.fillStyle = '#2a2622'; ctx.fillRect(-0.2, bw + 0.04, 0.5, 0.16); }
  if (L.bag === 'case') { ctx.fillStyle = '#1a1714'; ctx.fillRect(-0.05, bw + 0.02, 0.32, 0.1); }
  if (L.bag === 'tote') { ctx.fillStyle = '#6b5a44'; ctx.fillRect(-0.12, -bw - 0.14, 0.24, 0.14); }
  // Shoulders.
  ctx.fillStyle = L.coat;
  ctx.beginPath(); ctx.ellipse(0, 0, bd, bw, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1 / scale;
  ctx.stroke();
  // Head.
  ctx.fillStyle = L.hat ? hatColour(L.hat, L.coat) : L.hair;
  ctx.beginPath(); ctx.arc(0.02, 0, 0.12, 0, Math.PI * 2); ctx.fill();
  if (L.hat === 'brim') { ctx.strokeStyle = hatColour('brim', L.coat); ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(0.02, 0, 0.17, 0, Math.PI * 2); ctx.stroke(); }
  if (L.hat === 'cap') { ctx.fillStyle = '#1a2233'; ctx.fillRect(0.08, -0.07, 0.12, 0.14); }
  // A face edge so you can read which way they look.
  ctx.fillStyle = L.skin;
  ctx.beginPath(); ctx.arc(0.08, 0, 0.06, -1.2, 1.2); ctx.fill();
  // What they are doing, held in front.
  if (a.activity === 'phone') { ctx.fillStyle = '#9fc2d8'; ctx.fillRect(0.2, -0.04, 0.05, 0.08); }
  if (a.activity === 'read') { ctx.fillStyle = PAL.paper; ctx.fillRect(0.18, -0.12, 0.08, 0.24); }
  if (a.activity === 'coffee') { ctx.fillStyle = '#c9b89a'; ctx.beginPath(); ctx.arc(0.22, 0.12, 0.04, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // Sleepers: head dropped forward.
  if (a.activity === 'sleep') {
    ctx.strokeStyle = 'rgba(233,226,207,0.5)';
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.arc(x + 0.25, y - 0.35, 0.08, Math.PI, Math.PI * 2); ctx.stroke();
  }
}

/** Wren: the pale hood, the rust-orange board across her back. */
export function drawWren(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, p: Player, time: number, scale: number): void {
  const moving = Math.hypot(p.vel.x, p.vel.y) > 0.15;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  ctx.scale(FIG, FIG);
  if (moving) {
    const rate = p.gait === 'run' ? 15 : p.gait === 'sneak' ? 5 : 10;
    const sw = Math.sin(time * rate) * (p.gait === 'run' ? 0.22 : 0.14);
    ctx.fillStyle = '#0b0a09';
    ctx.beginPath(); ctx.ellipse(sw, -0.1, 0.1, 0.06, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-sw, 0.1, 0.1, 0.06, 0, 0, Math.PI * 2); ctx.fill();
  }
  // The board, across the back.
  ctx.fillStyle = PAL.wrenBoard;
  ctx.beginPath();
  ctx.ellipse(-0.2, 0, 0.09, 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2622';
  ctx.fillRect(-0.24, -0.3, 0.08, 0.05);
  ctx.fillRect(-0.24, 0.25, 0.08, 0.05);
  // Jacket.
  const crouch = p.gait === 'sneak' ? 0.86 : 1;
  ctx.fillStyle = PAL.wren;
  ctx.beginPath(); ctx.ellipse(0, 0, 0.17 * crouch, 0.28 * crouch, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0b0a09';
  ctx.lineWidth = 1.5 / scale;
  ctx.stroke();
  // Head: the hood up reads as a bigger, rounder pale shape.
  if (p.look.hood) {
    ctx.fillStyle = '#d9d3c4';
    ctx.beginPath(); ctx.arc(0.0, 0, 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#211d19';
    ctx.beginPath(); ctx.arc(0.07, 0, 0.08, -1.1, 1.1); ctx.fill();
  } else {
    ctx.fillStyle = '#2a1d16';
    ctx.beginPath(); ctx.arc(0.02, 0, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9a6a4c';
    ctx.beginPath(); ctx.arc(0.08, 0, 0.06, -1.2, 1.2); ctx.fill();
  }
  ctx.restore();
}

function hatColour(h: string, coat: string): string {
  if (h === 'cap') return '#1f2a3f';
  if (h === 'beanie') return shadeHex(coat, 0.25);
  return '#2a2520';
}

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}
