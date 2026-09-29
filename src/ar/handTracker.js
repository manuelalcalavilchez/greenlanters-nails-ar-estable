// handTracker.js
// Envoltorio funcional sobre @mediapipe/tasks-vision HandLandmarker.
// Corre 100% en el dispositivo (WASM/GPU). No se envía vídeo a ningún servidor.
//
// Requiere dependencia: "@mediapipe/tasks-vision" (ver package.json).

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let handLandmarkerInstance = null;

/**
 * Índices de landmarks relevantes por dedo (MediaPipe Hand Landmark model,
 * 21 puntos). MCP = nudillo base, PIP/DIP = articulaciones intermedias,
 * TIP = punta del dedo. La uña se estima entre DIP y TIP (ver nailGeometry.js).
 *
 * CORRECCIÓN (bug del pulgar desproporcionado): antes `pip` y `dip` del
 * pulgar apuntaban los dos al mismo landmark (3, la articulación IP), por
 * ser el pulgar el único dedo con una falange menos. Eso hacía que
 * nailGeometry.js calculase dist(pip, dip) = 0 SIEMPRE para el pulgar, y su
 * ancho de uña quedaba fijo en el mínimo de 8px sin importar el tamaño real
 * de la mano ni la distancia a la cámara — cuando la mano se alejaba, los
 * otros 4 dedos encogían correctamente y el pulgar se quedaba con ese
 * tamaño fijo, viéndose desproporcionadamente grande.
 * Ahora `pip` del pulgar apunta al MCP (2), así dist(pip, dip) mide el
 * segmento MCP→IP (falange proximal), un tramo real que sí escala con la
 * mano — igual que pip→dip mide una falange real en el resto de dedos.
 * `dip` se mantiene en 3 y `tip` en 4, así que el centro de la uña
 * (calculado en nailGeometry.js a partir de dip y tip) no cambia.
 */
export const FINGER_LANDMARKS = {
  thumb: { mcp: 2, pip: 2, dip: 3, tip: 4 },
  index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
  middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
  ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
  pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 },
};

export const DEFAULT_CONFIDENCE = 0.6;

export function readConfidence(search = typeof window !== 'undefined' && window.location ? window.location.search : '') {
  const raw = new URLSearchParams(search).get('conf');
  const value = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_CONFIDENCE;
  return Math.min(0.9, Math.max(0.3, value));
}

export async function initHandTracker({
  // CDN oficial de Google para los assets WASM del runtime. Si prefieres
  // servir esto tú mismo (recomendado en producción para no depender de un
  // tercero), descarga la carpeta wasm de @mediapipe/tasks-vision a /public
  // y cambia esta URL por una ruta local.
  wasmBaseUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  numHands = 2,
  runningMode = 'VIDEO',
} = {}) {
  if (handLandmarkerInstance) return handLandmarkerInstance;

  const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl);
  const confidence = readConfidence();
  const options = {
    baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
    runningMode,
    numHands,
    // Umbrales más altos que antes (0.45) para reducir manos fantasma. Se pueden
    // ajustar sin redesplegar con ?conf=0.5 (rango 0.3-0.9) para probar en el móvil.
    minHandDetectionConfidence: confidence,
    minHandPresenceConfidence: confidence,
    minTrackingConfidence: Math.max(0.3, confidence - 0.1),
  };

  try {
    handLandmarkerInstance = await HandLandmarker.createFromOptions(vision, options);
  } catch (gpuError) {
    console.warn('MediaPipe GPU no disponible; usando CPU.', gpuError);
    handLandmarkerInstance = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' },
    });
  }
  return handLandmarkerInstance;
}

/**
 * Detecta manos en un frame de vídeo. Debe llamarse dentro de un
 * requestAnimationFrame loop con `videoElement.currentTime` variando.
 * Devuelve la forma nativa de MediaPipe: { landmarks: [][21], handedness: [] }
 */
export function detectForVideo(videoElement, timestampMs) {
  if (!handLandmarkerInstance) {
    throw new Error('handTracker no inicializado: llama a initHandTracker() primero.');
  }
  return handLandmarkerInstance.detectForVideo(videoElement, timestampMs);
}

export function disposeHandTracker() {
  if (handLandmarkerInstance) {
    handLandmarkerInstance.close();
    handLandmarkerInstance = null;
  }
}

/**
 * MediaPipe devuelve "Left"/"Right" desde el punto de vista de la CÁMARA,
 * que con cámara frontal (selfie) está espejado respecto a la mano real de
 * la usuaria. Este helper corrige eso.
 */
export function resolveHandedness(handednessLabel, isFrontCamera) {
  const raw = handednessLabel === 'Left' ? 'left' : 'right';
  if (!isFrontCamera) return raw;
  return raw === 'left' ? 'right' : 'left';
}
