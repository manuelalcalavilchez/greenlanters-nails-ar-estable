// One-Euro por dedo, pensado para alimentarse SOLO con detecciones nuevas
// (timestamp real de detección, ~18 Hz). El render a 60 Hz se interpola aparte
// con interpolateRect(), así el filtro no ve muestras repetidas.
//
// Unidades: x, y, width y height se normalizan por el tamaño de la mano
// (opts.scale, en px). Así `beta` significa "manos/segundo" y el comportamiento
// no depende del dpr, del viewport ni de la distancia a la cámara.
// El ángulo (rad) usa sus propios minCutoff/beta.
//
// El contorno NO se filtra: es función pura de (forma, ancho, alto, dedo) y se
// reconstruye con opts.rebuild, de modo que siempre es coherente con el rect.

export function createSmoother(options = {}) {
  const state = new Map();
  const config = {
    minCutoff: options.minCutoff ?? 1.0,
    beta: options.beta ?? 5,
    dCutoff: options.dCutoff ?? 1.0,
    angleMinCutoff: options.angleMinCutoff ?? 1.5,
    angleBeta: options.angleBeta ?? 3,
  };

  function smooth(fingerId, rect, timestampMs = performance.now(), opts = {}) {
    if (!rect) {
      state.delete(fingerId);
      return null;
    }
    const scale = opts.scale > 0 ? opts.scale : 1;
    let filters = state.get(fingerId);
    if (!filters) {
      filters = {
        x: new OneEuroScalar(config.minCutoff, config.beta, config.dCutoff),
        y: new OneEuroScalar(config.minCutoff, config.beta, config.dCutoff),
        width: new OneEuroScalar(config.minCutoff, config.beta, config.dCutoff),
        height: new OneEuroScalar(config.minCutoff, config.beta, config.dCutoff),
        angle: new OneEuroScalar(config.angleMinCutoff, config.angleBeta, config.dCutoff),
      };
      state.set(fingerId, filters);
    }

    const filtered = {
      x: filters.x.filter(rect.x, timestampMs, scale),
      y: filters.y.filter(rect.y, timestampMs, scale),
      width: filters.width.filter(rect.width, timestampMs, scale),
      height: filters.height.filter(rect.height, timestampMs, scale),
      angle: filterAngle(filters.angle, rect.angle, timestampMs),
      tipCurve: rect.tipCurve,
    };
    filtered.contour = opts.rebuild ? opts.rebuild(filtered) : rect.contour;
    return filtered;
  }

  function reset(fingerId) {
    if (fingerId === undefined) state.clear();
    else state.delete(fingerId);
  }

  return { smooth, reset };
}

// Interpolación exponencial por frame hacia el objetivo ya filtrado.
// alpha = 1 - exp(-dt / tau). Sin `prev` devuelve el objetivo tal cual.
export function interpolateRect(prev, target, alpha, rebuild) {
  if (!target) return null;
  if (!prev) return { ...target };
  const a = Math.min(1, Math.max(0, alpha));
  let dAngle = target.angle - prev.angle;
  while (dAngle > Math.PI) dAngle -= Math.PI * 2;
  while (dAngle < -Math.PI) dAngle += Math.PI * 2;
  const next = {
    x: prev.x + (target.x - prev.x) * a,
    y: prev.y + (target.y - prev.y) * a,
    width: prev.width + (target.width - prev.width) * a,
    height: prev.height + (target.height - prev.height) * a,
    angle: prev.angle + dAngle * a,
    tipCurve: target.tipCurve,
  };
  next.contour = rebuild ? rebuild(next) : target.contour;
  return next;
}

export class OneEuroScalar {
  constructor(minCutoff, beta, dCutoff) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = null;
    this.dx = 0;
    this.lastTime = null;
  }

  filter(value, timestampMs, scale = 1) {
    if (this.lastTime == null) {
      this.lastTime = timestampMs;
      this.x = value;
      return value;
    }
    let dt = (timestampMs - this.lastTime) / 1000;
    if (!(dt > 0)) dt = 1 / 30;
    this.lastTime = timestampMs;
    const rawDx = (value - this.x) / dt / scale;
    this.dx += (rawDx - this.dx) * lowPassAlpha(this.dCutoff, dt);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += (value - this.x) * lowPassAlpha(cutoff, dt);
    return this.x;
  }
}

function filterAngle(scalar, value, timestampMs) {
  if (scalar.x == null) return scalar.filter(value, timestampMs);
  let delta = value - scalar.x;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return scalar.filter(scalar.x + delta, timestampMs);
}

function lowPassAlpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}
