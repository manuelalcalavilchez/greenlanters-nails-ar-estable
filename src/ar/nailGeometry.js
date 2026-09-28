import { FINGER_LANDMARKS } from './handTracker';
import { getShapeById } from '../data/nailShapes';

function pxPoint(point, canvasSize) {
  return { x: point.x * canvasSize.width, y: point.y * canvasSize.height };
}

function distancePx(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

// Ajuste de encaje de la uña sobre el dedo. Los valores por defecto no cambian
// el comportamiento actual (shift 0, length 1, width 1). Para afinar en el móvil
// sin redesplegar se pueden pasar por URL: ?shift=0.6&len=1.2&wid=1.2
//   shift: desplazamiento de la uña hacia la punta, como fracción de la falange distal
//   len:   multiplicador del largo de la uña
//   wid:   multiplicador del ancho de la uña
//   tlen / twid: multiplicadores extra solo para el pulgar (se suman a len / wid)
const FIT_DEFAULTS = { shift: 0, length: 1, width: 1, thumbLength: 1, thumbWidth: 1 };

function readFitOverrides() {
  if (typeof window === 'undefined' || !window.location) return {};
  const query = new URLSearchParams(window.location.search);
  const read = (key) => {
    if (!query.has(key)) return undefined;
    const value = Number(query.get(key));
    return Number.isFinite(value) ? value : undefined;
  };
  const overrides = {
    shift: read('shift'), length: read('len'), width: read('wid'),
    thumbLength: read('tlen'), thumbWidth: read('twid'),
  };
  return Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined));
}

export const NAIL_FIT = { ...FIT_DEFAULTS, ...readFitOverrides() };

const SHAPE_ANCHORS = {
  round: { base: 0.70, tip: 0.72, tipWidth: 0.62, shoulder: 0.92 },
  oval: { base: 0.62, tip: 0.68, tipWidth: 0.46, shoulder: 0.82 },
  almond: { base: 0.64, tip: 0.08, tipWidth: 0.04, shoulder: 0.78 },
  square: { base: 0.64, tip: 0.15, tipWidth: 0.48, shoulder: 0.94 },
  coffin: { base: 0.50, tip: 0.18, tipWidth: 0.66, shoulder: 0.86 },
  stiletto: { base: 0.64, tip: 0.08, tipWidth: 0.04, shoulder: 0.72 },
};

// Tamaño de la mano en px (muñeca -> MCP del corazón). Sirve de escala para los
// mínimos y para normalizar el filtrado, en vez de píxeles absolutos que
// dominaban al alejar la mano.
export function handSizePx(landmarks, canvasSize) {
  const wrist = landmarks?.[0];
  const middleMcp = landmarks?.[9];
  if (!wrist || !middleMcp) return 200;
  return Math.max(1, distancePx(pxPoint(wrist, canvasSize), pxPoint(middleMcp, canvasSize)));
}

export function buildNailContour(shapeId, width, length, fingerId) {
  return buildContour(getShapeById(shapeId), width, length, fingerId);
}

function getFingerWidth(landmarks, fingerId, canvasSize, proximalLen, distalLen, handSize) {
  const p = landmarks.map((point) => pxPoint(point, canvasSize));

  if (fingerId === 'thumb') {
    return Math.max(handSize * 0.068, distalLen * 0.88, proximalLen * 0.64);
  }

  const distalNeighbors = {
    index: [p[7], p[11]],
    middle: [p[7], p[15]],
    ring: [p[11], p[19]],
    pinky: [p[15], p[19]],
  };

  // La anchura de la placa ungueal se relaciona mejor con la falange distal
  // que con la falange proximal. Los ratios siguen la calibración del demo
  // de referencia, pero conservamos el contour adaptativo de este proyecto.
  const distalWidthRatio = {
    index: 0.78,
    middle: 0.74,
    ring: 0.72,
    pinky: 0.80,
  }[fingerId] || 0.75;
  const pair = distalNeighbors[fingerId];
  const neighborSpan = pair?.[0] && pair?.[1] ? distancePx(pair[0], pair[1]) : 0;
  const neighborWidth = neighborSpan * (fingerId === 'pinky' ? 0.30 : 0.27);
  return Math.max(handSize * 0.056, distalLen * distalWidthRatio, neighborWidth);
}

function buildContour(shape, width, length, fingerId) {
  const anchor = SHAPE_ANCHORS[shape.id] || SHAPE_ANCHORS.round;
  const half = width / 2;
  const baseHalf = half * anchor.base;
  const shoulderHalf = half * anchor.shoulder;
  const tipHalf = half * anchor.tipWidth;
  const cuticleCurve = length * (fingerId === 'thumb' ? 0.08 : 0.065);

  // Coordenadas locales: +Y apunta hacia la cutícula y -Y hacia la punta.
  // La base queda ligeramente más ancha y curvada, como una uña real.
  return {
    baseLeft: { x: -baseHalf, y: length * 0.5 },
    baseRight: { x: baseHalf, y: length * 0.5 },
    leftControl1: { x: -shoulderHalf, y: length * 0.39 },
    leftControl2: { x: -shoulderHalf, y: -length * 0.14 },
    rightControl1: { x: shoulderHalf, y: -length * 0.14 },
    rightControl2: { x: shoulderHalf, y: length * 0.39 },
    tipLeft: { x: -tipHalf, y: -length * (0.5 - anchor.tip * 0.42) },
    tipRight: { x: tipHalf, y: -length * (0.5 - anchor.tip * 0.42) },
    cuticleCurve,
  };
}

export function estimateNailRect(landmarks, fingerId, shapeId, canvasSize) {
  const idx = FINGER_LANDMARKS[fingerId];
  if (!idx) return null;

  const pip = landmarks[idx.pip];
  const dip = landmarks[idx.dip];
  const tip = landmarks[idx.tip];
  const mcp = landmarks[idx.mcp];
  if (!pip || !dip || !tip || !mcp) return null;

  const pipPx = pxPoint(pip, canvasSize);
  const dipPx = pxPoint(dip, canvasSize);
  const tipPx = pxPoint(tip, canvasSize);
  const mcpPx = pxPoint(mcp, canvasSize);

  const handSize = handSizePx(landmarks, canvasSize);
  const proximalLen = distancePx(mcpPx, pipPx);
  const distalLen = distancePx(dipPx, tipPx);
  // Con el dedo apuntando a la cámara DIP y TIP casi coinciden en 2D y el eje
  // sale casi aleatorio: en ese caso se usa PIP->TIP, mucho más estable.
  const axis = distalLen < handSize * 0.05
    ? normalize(tipPx.x - pipPx.x, tipPx.y - pipPx.y)
    : normalize(tipPx.x - dipPx.x, tipPx.y - dipPx.y);
  const fingerWidthPx = getFingerWidth(
    landmarks,
    fingerId,
    canvasSize,
    proximalLen,
    distalLen,
    handSize,
  ) * NAIL_FIT.width * (fingerId === 'thumb' ? NAIL_FIT.thumbWidth : 1);

  const shape = getShapeById(shapeId);
  const nailLength = Math.max(
    handSize * 0.064,
    Math.min(
      fingerWidthPx * shape.aspect,
      distalLen * (shape.id === 'stiletto' || shape.id === 'almond' ? 0.97 : 0.94),
    ),
  ) * NAIL_FIT.length * (fingerId === 'thumb' ? NAIL_FIT.thumbLength : 1);

  // La base queda prácticamente pegada al DIP, dejando solo un margen
  // pequeño para evitar que la máscara se meta en la articulación.
  const baseOffset = Math.max(handSize * 0.005, distalLen * 0.025);
  const centerAlongAxis = baseOffset + nailLength / 2 + distalLen * NAIL_FIT.shift;
  const center = {
    x: dipPx.x + axis.x * centerAlongAxis,
    y: dipPx.y + axis.y * centerAlongAxis,
  };

  return {
    x: center.x,
    y: center.y,
    width: fingerWidthPx,
    height: nailLength,
    angle: Math.atan2(axis.y, axis.x) + Math.PI / 2,
    tipCurve: shape.tipCurve,
    contour: buildContour(shape, fingerWidthPx, nailLength, fingerId),
  };
}

export function estimateHandNailRects(landmarks, nailDesign, canvasSize) {
  const result = {};
  for (const nail of nailDesign.nails) {
    result[nail.finger] = estimateNailRect(
      landmarks,
      nail.finger,
      nail.shape,
      canvasSize,
    );
  }
  return result;
}
