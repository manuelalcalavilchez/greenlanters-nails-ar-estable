// handGate.js
// Filtros contra "manos fantasma": detecciones falsas de MediaPipe (típicas con
// desenfoque de movimiento o cuando la mano sale del encuadre) que pintaban uñas
// flotando sobre el fondo.

// Una mano es plausible si la mayoría de sus 21 landmarks cae dentro (o casi)
// del encuadre y su tamaño no es ridículo respecto al lienzo.
export function isPlausibleHand(landmarks, size, {
  minInside = 12,
  margin = 0.1,
  minHandRatio = 0.04,
  maxHandRatio = 1.2,
} = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return false;
  let inside = 0;
  for (const point of landmarks) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (point.x >= -margin && point.x <= 1 + margin && point.y >= -margin && point.y <= 1 + margin) inside += 1;
  }
  if (inside < minInside) return false;
  const longSide = Math.max(size.width, size.height);
  const handSize = Math.hypot(
    (landmarks[9].x - landmarks[0].x) * size.width,
    (landmarks[9].y - landmarks[0].y) * size.height,
  );
  return handSize >= minHandRatio * longSide && handSize <= maxHandRatio * longSide;
}

// Puerta temporal: una mano solo se muestra tras `minFrames` detecciones seguidas
// y coherentes. Un hueco largo o un salto imposible cuentan como mano nueva
// (reset: hay que limpiar suavizado y uñas mostradas).
export function createHandGate({ minFrames = 2, maxGapMs = 400, maxJumpInHands = 2 } = {}) {
  let count = 0;
  let last = null; // { x, y, ts }

  return {
    update(center, handSize, ts) {
      let reset = false;
      if (last) {
        const gap = ts - last.ts;
        const jump = Math.hypot(center.x - last.x, center.y - last.y);
        if (gap > maxGapMs || jump > maxJumpInHands * Math.max(1, handSize)) {
          count = 0;
          reset = true;
        }
      }
      last = { x: center.x, y: center.y, ts };
      count += 1;
      return { show: count >= minFrames, reset };
    },
    reset() {
      count = 0;
      last = null;
    },
  };
}
