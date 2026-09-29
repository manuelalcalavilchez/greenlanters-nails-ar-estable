import { describe, it, expect } from 'vitest';
import { NAIL_FIT, estimateNailRect } from './nailGeometry';

// Mano sintética con los dedos hacia arriba en un lienzo de 540x960.
function handLandmarks() {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[0] = { x: 0.5, y: 0.9, z: 0 };
  lm[9] = { x: 0.5, y: 0.55, z: 0 }; // MCP corazón
  lm[10] = { x: 0.5, y: 0.47, z: 0 }; // PIP
  lm[11] = { x: 0.5, y: 0.41, z: 0 }; // DIP
  lm[12] = { x: 0.5, y: 0.36, z: 0 }; // TIP
  for (const i of [5, 13, 17]) lm[i] = { x: 0.5 + (i - 9) * 0.02, y: 0.55, z: 0 };
  return lm;
}

describe('encaje por defecto', () => {
  it('usa los valores ajustados en móvil', () => {
    expect(NAIL_FIT).toMatchObject({ shift: 0.68, length: 1.3, width: 1, thumbLength: 0.8, thumbWidth: 1 });
  });

  it('la uña del corazón queda entre el DIP y algo más allá de la punta, sobre el eje del dedo', () => {
    const size = { width: 540, height: 960 };
    const rect = estimateNailRect(handLandmarks(), 'middle', 'almond', size);
    const dipY = 0.41 * size.height;
    const tipY = 0.36 * size.height;
    expect(rect.x).toBeCloseTo(0.5 * size.width, 3);
    expect(rect.y).toBeLessThan(dipY); // hacia la punta (y decrece)
    const nailTipY = rect.y - rect.height / 2;
    expect(nailTipY).toBeLessThan(tipY + 4); // llega a la punta o algo más
    expect(nailTipY).toBeGreaterThan(tipY - (dipY - tipY)); // sin pasarse más de un tramo distal
  });
});
