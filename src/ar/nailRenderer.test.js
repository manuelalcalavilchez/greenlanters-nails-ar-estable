import { describe, it, expect } from 'vitest';
import { applyNailPath } from './nailRenderer';
import { buildNailContour } from './nailGeometry';

// ctx falso que solo registra las llamadas de trazado.
function recordPath(rect) {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, name) => (...args) => { calls.push({ name, args }); } });
  applyNailPath(ctx, rect);
  return calls;
}

describe('applyNailPath', () => {
  for (const shape of ['round', 'oval', 'almond', 'square', 'coffin', 'stiletto']) {
    for (const finger of ['index', 'thumb']) {
      it(`${shape}/${finger}: el borde derecho es el espejo del izquierdo`, () => {
        const width = 40; const height = 50;
        const rect = { width, height, contour: buildNailContour(shape, width, height, finger) };
        const beziers = recordPath(rect).filter((c) => c.name === 'bezierCurveTo');
        expect(beziers).toHaveLength(2);
        const [right, left] = beziers.map((c) => c.args); // derecho: base->punta; izquierdo: punta->base
        // Recorrido derecho (base->punta) = izquierdo invertido (punta->base), reflejado en x.
        expect(right[0]).toBeCloseTo(-left[2], 6); // 1er control derecho = 2º control izquierdo
        expect(right[1]).toBeCloseTo(left[3], 6);
        expect(right[2]).toBeCloseTo(-left[0], 6); // 2º control derecho = 1er control izquierdo
        expect(right[3]).toBeCloseTo(left[1], 6);
        expect(right[4]).toBeGreaterThan(0); // termina en la punta derecha (x > 0)
        expect(left[4]).toBeLessThan(0); // termina en la base izquierda (x < 0)
      });
    }
  }
});
