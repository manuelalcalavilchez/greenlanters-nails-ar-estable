import { describe, it, expect } from 'vitest';
import { createSmoother, interpolateRect } from './coordinateSmoothing';

const DT = 55; // ms entre detecciones
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const noise = (r, amp) => (r() - 0.5) * 2 * amp;
const rect = (o = {}) => ({ x: 100, y: 100, width: 40, height: 50, angle: 0, tipCurve: 0.3, contour: null, ...o });
const std = (a) => { const m = a.reduce((p, c) => p + c, 0) / a.length; return Math.sqrt(a.reduce((p, c) => p + (c - m) ** 2, 0) / a.length); };

describe('createSmoother (One-Euro)', () => {
  it('reduce el jitter en reposo', () => {
    const r = rng(7); const sm = createSmoother(); const raw = []; const out = [];
    for (let i = 0; i < 200; i += 1) {
      const v = 100 + noise(r, 2);
      raw.push(v);
      out.push(sm.smooth('index', rect({ x: v }), i * DT, { scale: 200 }).x);
    }
    expect(std(out.slice(20))).toBeLessThan(std(raw.slice(20)) * 0.5);
  });

  it('sigue un salto sin quedarse muy atrás', () => {
    const sm = createSmoother(); let last;
    for (let i = 0; i < 10; i += 1) sm.smooth('index', rect(), i * DT, { scale: 200 });
    for (let i = 10; i < 20; i += 1) last = sm.smooth('index', rect({ x: 200 }), i * DT, { scale: 200 });
    expect(last.x).toBeGreaterThan(190); // ~0,55 s
  });

  it('es equivariante al tamaño de la mano (mismo movimiento, doble escala)', () => {
    const a = createSmoother(); const b = createSmoother(); let oa; let ob;
    for (let i = 0; i < 30; i += 1) {
      const x = 100 + 60 * Math.sin(i / 4);
      oa = a.smooth('i', rect({ x }), i * DT, { scale: 100 }).x;
      ob = b.smooth('i', rect({ x: x * 2 }), i * DT, { scale: 200 }).x;
    }
    expect(ob).toBeCloseTo(oa * 2, 5);
  });

  it('el ángulo cruza ±π sin saltos', () => {
    const sm = createSmoother(); let prev = null; let maxJump = 0;
    for (let i = 0; i < 60; i += 1) {
      let ang = Math.PI - 0.5 + i * 0.02; // pasa de π a -π
      if (ang > Math.PI) ang -= Math.PI * 2;
      const o = sm.smooth('i', rect({ angle: ang }), i * DT, { scale: 200 }).angle;
      if (prev != null) maxJump = Math.max(maxJump, Math.abs(o - prev));
      prev = o;
    }
    expect(maxJump).toBeLessThan(0.5);
  });

  it('reconstruye el contorno con el rect filtrado', () => {
    const sm = createSmoother();
    const out = sm.smooth('i', rect(), 0, { rebuild: (r) => ({ w: r.width }) });
    expect(out.contour).toEqual({ w: 40 });
  });

  it('reset y rect nulo limpian el estado del dedo', () => {
    const sm = createSmoother();
    sm.smooth('i', rect({ x: 0 }), 0);
    expect(sm.smooth('i', null, DT)).toBeNull();
    expect(sm.smooth('i', rect({ x: 500 }), 2 * DT).x).toBe(500);
  });
});

describe('interpolateRect', () => {
  it('sin previo devuelve el objetivo; con alpha 1 lo alcanza', () => {
    const t = rect({ x: 50 });
    expect(interpolateRect(null, t, 0.3).x).toBe(50);
    expect(interpolateRect(rect({ x: 0 }), t, 1).x).toBe(50);
  });

  it('interpola el ángulo por el camino corto', () => {
    const r = interpolateRect(rect({ angle: Math.PI - 0.1 }), rect({ angle: -Math.PI + 0.1 }), 0.5);
    expect(Math.abs(Math.abs(r.angle) - Math.PI)).toBeLessThan(0.01);
  });
});
