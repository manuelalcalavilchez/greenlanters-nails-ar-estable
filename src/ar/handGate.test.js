import { describe, it, expect } from 'vitest';
import { isPlausibleHand, createHandGate } from './handGate';
import { readConfidence, DEFAULT_CONFIDENCE } from './handTracker';

const SIZE = { width: 540, height: 960 };

function hand({ cx = 0.5, cy = 0.6, span = 0.25 } = {}) {
  const lm = Array.from({ length: 21 }, (_, i) => ({
    x: cx + ((i % 5) - 2) * span * 0.1,
    y: cy - Math.floor(i / 5) * span * 0.15,
    z: 0,
  }));
  lm[0] = { x: cx, y: cy + span * 0.4, z: 0 };
  lm[9] = { x: cx, y: cy - span * 0.1, z: 0 };
  return lm;
}

describe('isPlausibleHand', () => {
  it('acepta una mano normal dentro del encuadre', () => {
    expect(isPlausibleHand(hand(), SIZE)).toBe(true);
  });
  it('rechaza si la mayoría de landmarks queda fuera del encuadre', () => {
    expect(isPlausibleHand(hand({ cx: 2.5 }), SIZE)).toBe(false);
  });
  it('rechaza manos diminutas o gigantes', () => {
    expect(isPlausibleHand(hand({ span: 0.005 }), SIZE)).toBe(false);
    expect(isPlausibleHand(hand({ span: 5 }), SIZE)).toBe(false);
  });
  it('rechaza datos incompletos o no finitos', () => {
    expect(isPlausibleHand(null, SIZE)).toBe(false);
    expect(isPlausibleHand(hand().slice(0, 10), SIZE)).toBe(false);
    const bad = hand(); bad[3] = { x: NaN, y: 0.5, z: 0 };
    expect(isPlausibleHand(bad, SIZE)).toBe(false);
  });
});

describe('createHandGate', () => {
  it('muestra la mano solo tras dos detecciones coherentes seguidas', () => {
    const gate = createHandGate();
    expect(gate.update({ x: 200, y: 500 }, 150, 0)).toEqual({ show: false, reset: false });
    expect(gate.update({ x: 205, y: 498 }, 150, 55)).toEqual({ show: true, reset: false });
    expect(gate.update({ x: 210, y: 495 }, 150, 110).show).toBe(true);
  });
  it('un salto imposible cuenta como mano nueva: reset y vuelve a confirmar', () => {
    const gate = createHandGate();
    gate.update({ x: 100, y: 500 }, 150, 0);
    gate.update({ x: 105, y: 500 }, 150, 55);
    const jump = gate.update({ x: 450, y: 200 }, 150, 110); // >2 tamaños de mano en 55 ms
    expect(jump).toEqual({ show: false, reset: true });
    expect(gate.update({ x: 452, y: 202 }, 150, 165)).toEqual({ show: true, reset: false });
  });
  it('un hueco largo (mano perdida) exige confirmar de nuevo', () => {
    const gate = createHandGate();
    gate.update({ x: 100, y: 500 }, 150, 0);
    gate.update({ x: 100, y: 500 }, 150, 55);
    const back = gate.update({ x: 102, y: 500 }, 150, 1000);
    expect(back).toEqual({ show: false, reset: true });
  });
  it('un fantasma de un solo fotograma nunca llega a mostrarse', () => {
    const gate = createHandGate();
    expect(gate.update({ x: 300, y: 300 }, 120, 0).show).toBe(false);
    // siguiente detección lejos y varios cientos de ms después: otro fantasma aislado
    expect(gate.update({ x: 50, y: 800 }, 120, 700).show).toBe(false);
  });
  it('reset() olvida el estado', () => {
    const gate = createHandGate();
    gate.update({ x: 1, y: 1 }, 100, 0);
    gate.update({ x: 1, y: 1 }, 100, 55);
    gate.reset();
    expect(gate.update({ x: 1, y: 1 }, 100, 110).show).toBe(false);
  });
});

describe('readConfidence', () => {
  it('usa el valor por defecto sin parámetro o con basura', () => {
    expect(readConfidence('')).toBe(DEFAULT_CONFIDENCE);
    expect(readConfidence('?conf=abc')).toBe(DEFAULT_CONFIDENCE);
  });
  it('lee ?conf y lo acota a 0.3-0.9', () => {
    expect(readConfidence('?debug=1&conf=0.5')).toBe(0.5);
    expect(readConfidence('?conf=0.05')).toBe(0.3);
    expect(readConfidence('?conf=5')).toBe(0.9);
  });
});
