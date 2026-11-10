/**
 * The built world: textured floors, the station's architecture and its set
 * dressing. Drawn in world metres (the caller sets the transform).
 */
import type { Dressing } from '../content/dressing';
import { POSTER_COLOURS } from '../content/dressing';
import type { Solid, Zone } from '../sim/types';
import { FLOOR_MATERIAL, type Materials } from './materials';
import { PAL } from './palette';

/** How far up the screen a metre of height is drawn. */
export const ZK = 0.55;
/** Visual height cap per kind. Interiors are a tall cutaway; buildings are full height. */
export const CUTAWAY: Partial<Record<Solid['kind'], number>> = {
  wall: 3, pillar: 3.4, shelter: 2.4, kiosk: 2.6, board: 3.2, machine: 1.9, locker: 2.1, train: 3.4, fence: 1.4, barrier: 1.1,
};

export const visualHeight = (s: Solid): number => Math.min(s.z, CUTAWAY[s.kind] ?? s.z) * ZK;

export interface View { x: number; y: number; w: number; h: number }

const FLAT: Record<Zone['floor'], string> = {
  asphalt: '#2c2b28', pavement: '#4a4640', tile: '#57514a', platform: '#5a564f', track: '#2a2724', staff: '#46504a', bridge: '#5a564f', alley: '#2e2c29',
};

export function drawFloor(ctx: CanvasRenderingContext2D, z: Zone, mats: Materials, px: number): void {
  const pat = mats.get(FLOOR_MATERIAL[z.floor]);
  ctx.fillStyle = pat ?? FLAT[z.floor];
  ctx.fillRect(z.x, z.y, z.w, z.h);
  if (z.floor === 'pavement') {
    // Kerb: a lit granite edge, then the gutter.
    ctx.fillStyle = '#6a655c';
    ctx.fillRect(z.x, z.y, z.w, 0.22);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(z.x, z.y - 0.3, z.w, 0.3);
  } else if (z.floor === 'asphalt') {
    ctx.strokeStyle = 'rgba(225,215,190,0.42)';
    ctx.lineWidth = 0.14;
    ctx.setLineDash([2.4, 2.2]);
    ctx.beginPath(); ctx.moveTo(z.x, z.y + z.h / 2); ctx.lineTo(z.x + z.w, z.y + z.h / 2); ctx.stroke();
    ctx.setLineDash([]);
  } else if (z.floor === 'track') {
    // Sleepers and two rails with a lit top edge.
    ctx.fillStyle = '#2b241d';
    for (let x = z.x; x < z.x + z.w; x += 0.75) ctx.fillRect(x, z.y + 0.75, 0.28, z.h - 1.5);
    for (const ry of [z.y + 1.45, z.y + z.h - 1.55]) {
      ctx.fillStyle = '#3a3731';
      ctx.fillRect(z.x, ry - 0.04, z.w, 0.18);
      ctx.fillStyle = '#9a958a';
      ctx.fillRect(z.x, ry, z.w, 0.05);
    }
  } else if (z.floor === 'platform') {
    // The platform edge: a pale coping stone.
    if (z.id === 'p1') { ctx.fillStyle = '#8a857a'; ctx.fillRect(z.x, z.y + z.h - 0.35, z.w, 0.35); }
    if (z.id === 'p2') { ctx.fillStyle = '#8a857a'; ctx.fillRect(z.x, z.y, z.w, 0.35); ctx.fillRect(z.x, z.y + z.h - 0.35, z.w, 0.35); }
  }
  void px;
}

/** Ambient occlusion and a cast shadow, so objects sit on the ground. */
export function drawShadow(ctx: CanvasRenderingContext2D, s: Solid): void {
  const h = visualHeight(s);
  if (h <= 0.05) return;
  const reach = Math.min(1.6, 0.25 + h * 0.35);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(s.x - 0.12, s.y - 0.05, s.w + 0.24 + reach * 0.5, s.h + 0.1 + reach);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(s.x, s.y, s.w + reach * 0.25, s.h + reach * 0.5);
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

/** Draw one solid at its base position (x shift for rolling trains). */
export function drawSolid(ctx: CanvasRenderingContext2D, s: Solid, mats: Materials, px: number, xShift: number, time: number): void {
  drawSolidBody(ctx, s, mats, px, xShift, time);
  // Ink: a heavy outline around the silhouette, a fine one on the top edge.
  if (s.kind === 'fence' || s.kind === 'bin') return;
  const h = visualHeight(s), x = s.x + xShift;
  ctx.strokeStyle = 'rgba(8,7,6,0.85)';
  ctx.lineWidth = px * 2.2;
  ctx.strokeRect(x, s.y - h, s.w, s.h + h);
  if (h > 0.2) {
    ctx.lineWidth = px * 1.2;
    ctx.beginPath(); ctx.moveTo(x, s.y + s.h - h); ctx.lineTo(x + s.w, s.y + s.h - h); ctx.stroke();
  }
}

function drawSolidBody(ctx: CanvasRenderingContext2D, s: Solid, mats: Materials, px: number, xShift: number, time: number): void {
  const h = visualHeight(s);
  const x = s.x + xShift, y = s.y, w = s.w, d = s.h;
  const top = y - h, front = y + d - h;
  switch (s.kind) {
    case 'building': {
      const base = s.tint ?? '#38342f';
      // Brick front face, a cornice and a roof.
      ctx.fillStyle = shade(base, -0.2);
      ctx.fillRect(x, front, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let by = front + 0.35; by < y + d; by += 0.35) ctx.fillRect(x, by, w, px);
      ctx.fillStyle = shade(base, 0.25);
      ctx.fillRect(x, front - 0.12, w, 0.24);
      ctx.fillStyle = mats.get('roof') ?? shade(base, 0.08);
      ctx.fillRect(x, top, w, d);
      ctx.strokeStyle = shade(base, 0.3);
      ctx.lineWidth = 0.22;
      ctx.strokeRect(x + 0.11, top + 0.11, w - 0.22, d - 0.22);
      if (s.label) label(ctx, s.label, x + w / 2, front + 0.55, 0.62, '#b8ab8e');
      break;
    }
    case 'wall': {
      // Glazed ochre brick dado under dark plaster: a Victorian station.
      ctx.fillStyle = '#3e3a34';
      ctx.fillRect(x, front, w, h);
      ctx.fillStyle = '#8a7350';
      ctx.fillRect(x, y + d - h * 0.45, w, h * 0.45);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let by = y + d - h * 0.45; by < y + d; by += 0.18) ctx.fillRect(x, by, w, px);
      ctx.fillStyle = '#a28a60';
      ctx.fillRect(x, y + d - h * 0.45 - 0.06, w, 0.06);
      ctx.fillStyle = '#8b8275';
      ctx.fillRect(x, top, w, d);
      ctx.fillStyle = '#a39a8b';
      ctx.fillRect(x, top, w, Math.min(0.18, d * 0.3));
      break;
    }
    case 'pillar': {
      // Cast iron, painted the old railway green, with a lit edge.
      ctx.fillStyle = '#1e2a24';
      ctx.fillRect(x + 0.08, front, w - 0.16, h);
      ctx.fillStyle = '#3a5246';
      ctx.fillRect(x + 0.08, front, (w - 0.16) * 0.35, h);
      octagon(ctx, x + w / 2, top + d / 2, w * 0.62, '#2f4338', '#6f8a78');
      break;
    }
    case 'train': {
      const body = s.tint ?? '#5d1f22';
      ctx.fillStyle = shade(body, -0.35);
      ctx.fillRect(x, front, w, h);
      // Lit windows along the side.
      ctx.fillStyle = s.label === 'HALVARD TRUST' ? 'rgba(190,225,200,0.75)' : 'rgba(250,206,140,0.8)';
      for (let wx = x + 1.4; wx < x + w - 1.6; wx += 2.4) ctx.fillRect(wx, front + h * 0.22, 1.5, h * 0.36);
      ctx.fillStyle = shade(body, 0.15);
      ctx.fillRect(x, front + h * 0.68, w, 0.12);
      // Roof: ribbed, with vents.
      ctx.fillStyle = '#6e6a63';
      ctx.fillRect(x, top, w, d);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let rx = x + 0.6; rx < x + w; rx += 0.6) ctx.fillRect(rx, top, px * 1.5, d);
      ctx.fillStyle = '#4e4b45';
      for (let vx = x + 3; vx < x + w - 2; vx += 6) ctx.fillRect(vx, top + d * 0.35, 1.4, d * 0.3);
      ctx.fillStyle = body;
      ctx.fillRect(x, top, w, 0.22);
      ctx.fillRect(x, top + d - 0.22, w, 0.22);
      if (s.label) label(ctx, s.label, x + w / 2, front + h * 0.86, 0.5, s.label === 'HALVARD TRUST' ? '#d8c58a' : '#e8d9b0');
      break;
    }
    case 'bench': {
      ctx.fillStyle = '#1b1a18';
      ctx.fillRect(x, top + d - 0.1, w, h + 0.1);
      ctx.fillStyle = '#6b4c32';
      for (let sy = 0; sy < 3; sy++) ctx.fillRect(x, top + sy * (d / 3) + 0.03, w, d / 3 - 0.07);
      ctx.fillStyle = '#26241f';
      for (let ex = x; ex <= x + w - 0.15; ex += Math.max(1.8, (w - 0.15) / 3)) ctx.fillRect(ex, top - 0.02, 0.15, d + 0.04);
      break;
    }
    case 'barrier': {
      ctx.fillStyle = '#4c4f50';
      ctx.fillRect(x, front, w, h);
      ctx.fillStyle = '#8f9393';
      ctx.fillRect(x, top, w, d);
      ctx.fillStyle = '#b4b8b6';
      ctx.fillRect(x, top, w, 0.08);
      // Gate lights at each end.
      for (const lx of [x + 0.15, x + w - 0.15]) {
        ctx.fillStyle = Math.floor(time * 1.5 + lx) % 4 === 0 ? '#e8432c' : '#7fbf6a';
        ctx.fillRect(lx - 0.06, top + 0.3, 0.12, 0.2);
      }
      break;
    }
    case 'kiosk': {
      ctx.fillStyle = '#3a2a22';
      ctx.fillRect(x, front, w, h);
      // Lit counter front with stacked papers and cups.
      ctx.fillStyle = '#c9a46a';
      ctx.fillRect(x + 0.4, y + d - 0.9, w - 0.8, 0.7);
      ctx.fillStyle = '#e8dfc8';
      for (let i = 0; i < 6; i++) ctx.fillRect(x + 0.7 + i * 1.1, y + d - 0.75, 0.7, 0.4);
      // Striped awning, sagging toward its scalloped front edge.
      for (let i = 0; i < w / 0.4; i++) {
        ctx.fillStyle = i % 2 ? '#b9ab8a' : '#5a2420';
        ctx.fillRect(x + i * 0.4, top, 0.4, d);
      }
      const g = ctx.createLinearGradient(0, top, 0, top + d);
      g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x, top, w, d);
      for (let i = 0; i < w / 0.4; i++) {
        ctx.fillStyle = i % 2 ? '#a89a7a' : '#4a1e1a';
        ctx.beginPath(); ctx.arc(x + i * 0.4 + 0.2, top + d, 0.2, 0, Math.PI); ctx.fill();
      }
      break;
    }
    case 'machine': {
      const body = s.tint ?? '#3f5a6a';
      ctx.fillStyle = shade(body, -0.3);
      ctx.fillRect(x, front, w, h);
      ctx.fillStyle = s.label === 'TICKETS' ? '#cfe4ef' : '#e8eef0';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x + 0.2, front + 0.18, w - 0.4, h * 0.42);
      ctx.globalAlpha = 1;
      ctx.fillStyle = body;
      ctx.fillRect(x, top, w, d);
      if (s.label) label(ctx, s.label, x + w / 2, front + h * 0.82, 0.26, '#efe6d0');
      break;
    }
    case 'board': {
      ctx.fillStyle = '#121211';
      ctx.fillRect(x, front - 0.2, w, h + 0.2);
      ctx.fillStyle = '#2a2826';
      ctx.fillRect(x, top - 0.2, w, d);
      // Rows of amber dot-matrix departures.
      const rows = ['23:46  NIGHT MAIL   STERLING   P1', '23:58  LOOP LOCAL  ASHBY      P2', '00:20  LOOP LOCAL  SALTMARKET P2'];
      rows.forEach((r, i) => label(ctx, r, x + w / 2, front + 0.35 + i * 0.42, 0.3, i === 0 ? '#f2b544' : '#a6782e', 'mono'));
      break;
    }
    case 'vehicle': {
      const body = s.tint ?? '#55504a';
      ctx.fillStyle = shade(body, -0.35);
      ctx.fillRect(x, front, w, h);
      ctx.fillStyle = body;
      ctx.fillRect(x, top, w, d);
      ctx.fillStyle = '#1c2228';
      ctx.fillRect(x + w * 0.72, top + 0.2, w * 0.16, d - 0.4);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 0.3, top + 0.25, w * 0.4, d - 0.5);
      ctx.fillStyle = '#e8432c';
      ctx.fillRect(x - 0.05, front + h * 0.4, 0.1, 0.3);
      break;
    }
    case 'fence': {
      ctx.strokeStyle = 'rgba(150,150,140,0.55)';
      ctx.lineWidth = px;
      ctx.beginPath();
      if (w > d) { for (let fx = x; fx < x + w; fx += 0.3) { ctx.moveTo(fx, y + d); ctx.lineTo(fx + 0.3, top); ctx.moveTo(fx + 0.3, y + d); ctx.lineTo(fx, top); } }
      else { for (let fy = y; fy < y + d; fy += 0.3) { ctx.moveTo(x, fy); ctx.lineTo(x + w, fy - h); } }
      ctx.stroke();
      ctx.fillStyle = '#6b6a64';
      ctx.fillRect(x, top, w, Math.min(d, 0.12));
      break;
    }
    case 'bin': {
      ctx.fillStyle = '#1e2a22';
      ctx.fillRect(x, front, w, h);
      ctx.fillStyle = '#2e3e32';
      ctx.beginPath(); ctx.ellipse(x + w / 2, top + d / 2, w / 2, d / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0e0e0c';
      ctx.beginPath(); ctx.ellipse(x + w / 2, top + d / 2, w / 3, d / 3, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'planter': {
      ctx.fillStyle = '#3a3a36';
      ctx.fillRect(x, front, w, h);
      ctx.fillStyle = '#4a4a44';
      ctx.fillRect(x, top, w, d);
      ctx.fillStyle = '#2f3a26';
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + 0.3 + i * (w - 0.6) / 4, top + d / 2, 0.38, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'shelter': {
      // Steel frame, glass panes you can see through, a tinted roof.
      ctx.fillStyle = 'rgba(160,190,200,0.14)';
      ctx.fillRect(x, front, w, h);
      ctx.fillStyle = 'rgba(40,48,52,0.55)';
      ctx.fillRect(x, top, w, d);
      ctx.strokeStyle = '#2a2e30'; ctx.lineWidth = 0.08;
      ctx.strokeRect(x, top, w, d);
      for (let fx = x; fx <= x + w + 0.01; fx += w / 3) { ctx.beginPath(); ctx.moveTo(fx, top + d); ctx.lineTo(fx, y + d); ctx.stroke(); }
      ctx.fillStyle = 'rgba(235,240,240,0.12)';
      ctx.fillRect(x + 0.2, front + 0.1, w * 0.25, h * 0.6);
      ctx.fillStyle = '#5a4a36';
      ctx.fillRect(x + 0.3, y + 0.2, w - 0.6, 0.35);
      return;
    }
    case 'locker': {
      ctx.fillStyle = '#3c4146';
      ctx.fillRect(x, front, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let lx = x + 0.6; lx < x + w; lx += 0.6) ctx.fillRect(lx, front, px, h);
      ctx.fillStyle = '#5a5f66';
      ctx.fillRect(x, top, w, d);
      break;
    }
    case 'counter': {
      const body = s.tint ?? '#6a5a48';
      ctx.fillStyle = shade(body, -0.35);
      ctx.fillRect(x, front, w, h);
      ctx.fillStyle = body;
      ctx.fillRect(x, top, w, d);
      if (s.label === 'trolley') {
        ctx.fillStyle = '#3b2f26';
        ctx.fillRect(x + 0.2, top + 0.15, w * 0.45, d - 0.3);
        ctx.fillStyle = '#5c4a3a';
        ctx.fillRect(x + w * 0.55, top + 0.25, w * 0.35, d - 0.5);
      }
      break;
    }
  }
}

function octagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, edge: string): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.9;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 0.06; ctx.stroke();
}

/** Text in world space (metres). */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, col: string, face: 'sign' | 'mono' = 'sign'): void {
  ctx.save();
  ctx.translate(x, y);
  // Draw at 100x and scale down: browsers clamp tiny font sizes.
  ctx.scale(size / 100, size / 100);
  ctx.font = face === 'mono' ? '700 100px "Courier Prime", monospace' : '800 100px "Big Shoulders Display", "Arial Narrow", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = col;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ---------------------------------------------------------------- dressing

export function drawDressing(ctx: CanvasRenderingContext2D, items: Dressing[], view: View, px: number, time: number, reducedMotion: boolean): void {
  for (const it of items) {
    const ix = it.x, iy = it.y;
    if (ix < view.x - 10 || ix > view.x + view.w + 10 || iy < view.y - 6 || iy > view.y + view.h + 6) continue;
    switch (it.k) {
      case 'tactile': {
        ctx.fillStyle = '#b8962e';
        ctx.fillRect(it.x, it.y, it.w, it.h);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        const x0 = Math.max(it.x, view.x), x1 = Math.min(it.x + it.w, view.x + view.w);
        for (let x = Math.ceil(x0 / 0.18) * 0.18; x < x1; x += 0.18) for (let y = it.y + 0.09; y < it.y + it.h; y += 0.18) ctx.fillRect(x, y, 0.07, 0.07);
        break;
      }
      case 'crossing': {
        ctx.fillStyle = 'rgba(225,218,200,0.55)';
        for (let x = it.x; x < it.x + it.w; x += 1) ctx.fillRect(x, it.y + 0.3, 0.55, it.h - 0.6);
        break;
      }
      case 'manhole': {
        ctx.fillStyle = '#1d1c1a';
        ctx.beginPath(); ctx.arc(it.x, it.y, 0.42, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4a4740'; ctx.lineWidth = 0.05;
        for (let r = 0.12; r < 0.42; r += 0.1) { ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, Math.PI * 2); ctx.stroke(); }
        break;
      }
      case 'grate': {
        ctx.fillStyle = '#141311';
        ctx.fillRect(it.x - 0.6, it.y - 0.3, 1.2, 0.6);
        ctx.fillStyle = '#4a4740';
        for (let x = it.x - 0.55; x < it.x + 0.6; x += 0.16) ctx.fillRect(x, it.y - 0.28, 0.05, 0.56);
        if (it.steam && !reducedMotion) {
          for (let i = 0; i < 5; i++) {
            const ph = (time * 0.35 + i / 5) % 1;
            ctx.fillStyle = `rgba(220,215,205,${0.16 * (1 - ph)})`;
            ctx.beginPath(); ctx.arc(it.x + Math.sin(ph * 5 + i) * 0.4, it.y - ph * 3, 0.4 + ph * 1.2, 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      }
      case 'puddle': {
        ctx.fillStyle = 'rgba(14,16,20,0.6)';
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const r = it.r * (0.75 + 0.25 * Math.sin(a * 3 + it.seed));
          const x = it.x + Math.cos(a) * r * 1.4, y = it.y + Math.sin(a) * r * 0.7;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        // A streak of reflected lamp light.
        ctx.fillStyle = 'rgba(242,170,80,0.22)';
        ctx.fillRect(it.x - it.r * 0.6, it.y - 0.05, it.r * 1.2, 0.1);
        break;
      }
      case 'stain': {
        ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
        ctx.fillStyle = 'rgba(12,10,8,0.28)';
        ctx.beginPath(); ctx.ellipse(0, 0, it.r * 1.3, it.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(12,10,8,0.22)';
        ctx.beginPath(); ctx.ellipse(it.r * 0.4, it.r * 0.2, it.r * 0.6, it.r * 0.45, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;
      }
      case 'litter': {
        ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
        if (it.kind === 'cup') { ctx.fillStyle = '#d8cfba'; ctx.fillRect(-0.06, -0.09, 0.12, 0.18); ctx.fillStyle = '#7a2a24'; ctx.fillRect(-0.06, -0.02, 0.12, 0.05); }
        else if (it.kind === 'paper') { ctx.fillStyle = 'rgba(220,212,192,0.75)'; ctx.fillRect(-0.22, -0.15, 0.44, 0.3); ctx.fillStyle = 'rgba(40,36,30,0.4)'; for (let i = 0; i < 4; i++) ctx.fillRect(-0.18, -0.1 + i * 0.06, 0.3, 0.02); }
        else if (it.kind === 'can') { ctx.fillStyle = '#8c3a2a'; ctx.fillRect(-0.04, -0.08, 0.08, 0.16); ctx.fillStyle = '#c9c4ba'; ctx.fillRect(-0.04, -0.08, 0.08, 0.03); }
        else { ctx.fillStyle = '#d8cdb4'; for (let i = 0; i < 4; i++) ctx.fillRect(-0.12 + i * 0.07, (i % 2) * 0.06, 0.05, 0.015); }
        ctx.restore();
        break;
      }
      case 'bikes': {
        for (let i = 0; i < it.n; i++) {
          const bx = it.x + i * 0.8;
          ctx.strokeStyle = '#2a2a28'; ctx.lineWidth = 0.05;
          ctx.beginPath(); ctx.arc(bx, it.y - 0.35, 0.3, 0, Math.PI * 2); ctx.arc(bx, it.y + 0.45, 0.3, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = i % 2 ? '#6a2a24' : '#2c4a5a'; ctx.lineWidth = 0.07;
          ctx.beginPath(); ctx.moveTo(bx, it.y - 0.35); ctx.lineTo(bx, it.y + 0.45); ctx.stroke();
        }
        ctx.fillStyle = '#6b6a64'; ctx.fillRect(it.x - 0.4, it.y - 0.05, it.n * 0.8, 0.1);
        break;
      }
      case 'lamp': {
        // Post, arm and head; the light itself is drawn by the lighting pass.
        const hgt = it.tall ? 3.2 : 2.2;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(it.x + 0.15, it.y + 0.2, 0.25, 0.14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1e2a24';
        ctx.fillRect(it.x - 0.07, it.y - hgt, 0.14, hgt);
        ctx.fillStyle = '#2f4338';
        ctx.fillRect(it.x - 0.45, it.y - hgt - 0.1, 0.9, 0.16);
        ctx.fillStyle = '#f6c77a';
        ctx.fillRect(it.x - 0.3, it.y - hgt + 0.06, 0.6, 0.08);
        break;
      }
      case 'timetable': {
        ctx.fillStyle = '#1e2a24'; ctx.fillRect(it.x - 0.05, it.y - 1.5, 0.1, 1.5);
        ctx.fillRect(it.x - 0.65, it.y - 2.3, 1.3, 0.9);
        ctx.fillStyle = '#e9e2cf'; ctx.fillRect(it.x - 0.58, it.y - 2.23, 1.16, 0.76);
        ctx.fillStyle = 'rgba(23,20,15,0.6)';
        for (let i = 0; i < 6; i++) ctx.fillRect(it.x - 0.5, it.y - 2.14 + i * 0.11, 0.6 + (i % 3) * 0.12, 0.04);
        break;
      }
      case 'roofbox': {
        if (it.kind === 'skylight') {
          ctx.fillStyle = '#2a3238'; ctx.fillRect(it.x, it.y, it.w, it.h);
          ctx.fillStyle = 'rgba(240,190,120,0.35)';
          for (let x = it.x + 0.15; x < it.x + it.w - 0.2; x += 0.75) ctx.fillRect(x, it.y + 0.15, 0.6, it.h - 0.3);
        } else if (it.kind === 'tank') {
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(it.x + it.w / 2 + 0.4, it.y + it.h / 2 + 0.4, it.w / 2, it.h / 2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 2, it.h / 2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#3a2f26'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.ellipse(it.x + it.w / 2, it.y + it.h / 2, it.w / 3, it.h / 3, 0, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(it.x + 0.3, it.y + 0.3, it.w, it.h);
          ctx.fillStyle = it.kind === 'ac' ? '#7a7a74' : '#5a5650'; ctx.fillRect(it.x, it.y, it.w, it.h);
          if (it.kind === 'ac') { ctx.strokeStyle = '#3a3a36'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(it.x + it.h / 2, it.y + it.h / 2, it.h * 0.35, 0, Math.PI * 2); ctx.stroke(); }
          else { ctx.fillStyle = '#2e2c28'; for (let x = it.x + 0.15; x < it.x + it.w; x += 0.3) ctx.fillRect(x, it.y + 0.15, 0.12, it.h - 0.3); }
        }
        break;
      }
      default: break;
    }
  }
  void px;
}

/** Things that sit on vertical faces, drawn after the solids they hang on. */
export function drawWallDressing(ctx: CanvasRenderingContext2D, items: Dressing[], view: View, time: number): void {
  for (const it of items) {
    if (it.x < view.x - 10 || it.x > view.x + view.w + 10 || it.y < view.y - 6 || it.y > view.y + view.h + 6) continue;
    switch (it.k) {
      case 'poster': {
        const c = POSTER_COLOURS[it.art];
        // Hung on the face of the wall it belongs to.
        const h = it.lit ? 1.15 : 0.75, y = it.y - (it.lit ? -0.08 : 0.15) - h;
        ctx.fillStyle = it.lit ? '#111' : 'rgba(0,0,0,0.3)';
        ctx.fillRect(it.x - it.w / 2 - 0.06, y - 0.06, it.w + 0.12, h + 0.12);
        ctx.fillStyle = c.bg;
        ctx.fillRect(it.x - it.w / 2, y, it.w, h);
        posterArt(ctx, it.art, it.x, y, it.w, h, c.fg);
        break;
      }
      case 'window': {
        const h = 1.1, y = it.y - 0.6 - h;
        ctx.fillStyle = it.lit ? (it.warm ? '#d8a868' : '#a8c0c8') : '#1a1c1e';
        ctx.fillRect(it.x, y, it.w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(it.x + it.w / 2 - 0.03, y, 0.06, h);
        ctx.fillRect(it.x, y + h / 2 - 0.03, it.w, 0.06);
        break;
      }
      case 'tag': tag(ctx, it.art, it.x, it.y, it.s, it.rot); break;
      case 'sign': {
        ctx.fillStyle = '#16181b';
        ctx.fillRect(it.x - it.w / 2, it.y - 0.7, it.w, 0.55);
        ctx.fillStyle = '#e9e2cf';
        ctx.fillRect(it.x - it.w / 2, it.y - 0.7, it.w, 0.04);
        label(ctx, it.text, it.x, it.y - 0.42, 0.34, '#e9e2cf');
        break;
      }
      case 'clock': {
        ctx.fillStyle = '#16181b';
        ctx.beginPath(); ctx.arc(it.x, it.y - 1.6, 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e9e2cf';
        ctx.beginPath(); ctx.arc(it.x, it.y - 1.6, 0.46, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#16181b'; ctx.lineWidth = 0.05;
        const m = (time / 10) % (Math.PI * 2);
        ctx.beginPath(); ctx.moveTo(it.x, it.y - 1.6); ctx.lineTo(it.x + Math.sin(m) * 0.38, it.y - 1.6 - Math.cos(m) * 0.38); ctx.stroke();
        ctx.lineWidth = 0.08;
        ctx.beginPath(); ctx.moveTo(it.x, it.y - 1.6); ctx.lineTo(it.x + Math.sin(m / 12 + 2.8) * 0.25, it.y - 1.6 - Math.cos(m / 12 + 2.8) * 0.25); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(it.x, it.y - 1.05); ctx.lineTo(it.x, it.y); ctx.stroke();
        break;
      }
      default: break;
    }
  }
}

function posterArt(ctx: CanvasRenderingContext2D, art: string, cx: number, y: number, w: number, h: number, fg: string): void {
  const x = cx - w / 2;
  ctx.fillStyle = fg;
  switch (art) {
    case 'halvard':
      label(ctx, 'HALVARD TRUST', cx, y + h * 0.3, h * 0.22, fg);
      label(ctx, 'We look after it.', cx, y + h * 0.62, h * 0.13, fg, 'mono');
      ctx.fillRect(x + w * 0.1, y + h * 0.82, w * 0.8, 0.03);
      break;
    case 'lattice':
      // The civic eye, and the line they print under it.
      ctx.beginPath(); ctx.ellipse(x + w * 0.22, y + h / 2, w * 0.13, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e9e3d6'; ctx.beginPath(); ctx.arc(x + w * 0.22, y + h / 2, h * 0.09, 0, Math.PI * 2); ctx.fill();
      label(ctx, 'LATTICE', x + w * 0.64, y + h * 0.4, h * 0.26, fg);
      label(ctx, 'Calder is safer seen.', x + w * 0.64, y + h * 0.7, h * 0.12, '#2a2620', 'mono');
      break;
    case 'kettle':
      label(ctx, 'KETTLE LINE', cx, y + h * 0.3, h * 0.22, fg);
      label(ctx, 'Closed. Do not enter the tunnels.', cx, y + h * 0.62, h * 0.1, fg, 'mono');
      break;
    case 'calder':
      label(ctx, 'STERLING', cx, y + h * 0.32, h * 0.24, fg);
      label(ctx, 'by the Night Mail', cx, y + h * 0.66, h * 0.13, fg, 'mono');
      break;
    case 'gig':
      label(ctx, 'THE', cx, y + h * 0.22, h * 0.16, fg);
      label(ctx, 'STATICS', cx, y + h * 0.48, h * 0.3, '#b8321f');
      label(ctx, 'THE SUMPS SAT', cx, y + h * 0.8, h * 0.12, fg, 'mono');
      break;
    case 'lost':
      label(ctx, 'MISSING', cx, y + h * 0.22, h * 0.18, fg);
      ctx.fillStyle = '#8a8478'; ctx.fillRect(x + w * 0.3, y + h * 0.36, w * 0.4, h * 0.34);
      label(ctx, 'call 0144', cx, y + h * 0.84, h * 0.11, fg, 'mono');
      break;
  }
}

/** Stencils and tags, sprayed in the street's orange. */
function tag(ctx: CanvasRenderingContext2D, art: string, x: number, y: number, s: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = 0.78;
  const ink = '#d4683a';
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = 0.09 * s;
  switch (art) {
    case 'eye':
      ctx.beginPath(); ctx.moveTo(-0.8 * s, 0); ctx.quadraticCurveTo(0, -0.55 * s, 0.8 * s, 0); ctx.quadraticCurveTo(0, 0.55 * s, -0.8 * s, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 0.18 * s, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.9 * s, 0.55 * s); ctx.lineTo(0.9 * s, -0.55 * s); ctx.stroke();
      break;
    case 'wesee':
      label(ctx, 'WE SEE YOU TOO', 0, 0, 0.4 * s, ink);
      break;
    case 'wren':
      // Wren's own mark: a bird in three strokes.
      ctx.beginPath(); ctx.moveTo(-0.5 * s, 0.1 * s); ctx.lineTo(0, -0.25 * s); ctx.lineTo(0.5 * s, 0.1 * s); ctx.moveTo(0, -0.25 * s); ctx.lineTo(0.05 * s, 0.35 * s); ctx.stroke();
      break;
    case 'arrow':
      ctx.beginPath(); ctx.moveTo(-0.6 * s, 0); ctx.lineTo(0.5 * s, 0); ctx.moveTo(0.25 * s, -0.25 * s); ctx.lineTo(0.55 * s, 0); ctx.lineTo(0.25 * s, 0.25 * s); ctx.stroke();
      break;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
void PAL;
