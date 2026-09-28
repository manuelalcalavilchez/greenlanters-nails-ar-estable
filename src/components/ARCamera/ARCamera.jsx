import { useEffect, useRef, useState, useCallback } from 'react';
import { initHandTracker, detectForVideo, disposeHandTracker, resolveHandedness, FINGER_LANDMARKS } from '../../ar/handTracker';
import { estimateHandNailRects, handSizePx, buildNailContour, NAIL_FIT } from '../../ar/nailGeometry';
import { createSmoother, interpolateRect } from '../../ar/coordinateSmoothing';
import { drawNailDesign } from '../../ar/nailRenderer';
import { mapLandmarksToCover } from '../../ar/videoMapping';

const DETECTION_INTERVAL_MS = 55;
const HAND_LOST_GRACE_MS = 350;
const DISPLAY_TAU_MS = 45;
const DEBUG_INTERVAL_MS = 250;

export default function ARCamera({ design, preferredHand }) {
  const trackedHand = preferredHand || design?.hand || 'right';
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const smootherRef = useRef(createSmoother({ minCutoff: 1.0, beta: 5, dCutoff: 1.0 }));
  const facingModeRef = useRef('environment');
  const landmarksRef = useRef([]);
  const handednessRef = useRef([]);
  const lastDetectionAtRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const lastHandCenterRef = useRef(null);
  const handLostAtRef = useRef(0);
  const designRef = useRef(design);
  const trackedHandRef = useRef(trackedHand);
  const lastTimestampRef = useRef(0);
  const targetRectsRef = useRef(null);
  const displayRectsRef = useRef({});
  const mappedLandmarksRef = useRef(null);
  const lastFrameAtRef = useRef(0);
  const lastDebugAtRef = useRef(0);

  const [status, setStatus] = useState('idle');
  const [facingMode, setFacingMode] = useState('environment');
  const [cameraName, setCameraName] = useState('Cámara trasera');
  const [manualAdjust, setManualAdjust] = useState({
    scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 1
  });
  const manualAdjustRef = useRef(manualAdjust);
  const [errorMsg, setErrorMsg] = useState('');
  const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
  const [fit, setFit] = useState({ ...NAIL_FIT });
  const [debugInfo, setDebugInfo] = useState({ hands: 0, chosen: -1, rects: 0, video: '0x0', canvas: '0x0' });

  // Solo en modo debug: los sliders de encaje modifican NAIL_FIT en vivo (se lee en cada frame).
  const updateFit = (key, value) => {
    NAIL_FIT[key] = value;
    setFit((current) => ({ ...current, [key]: value }));
  };
  const fitQuery = 'shift=' + fit.shift.toFixed(2) + '&len=' + fit.length.toFixed(2) + '&wid=' + fit.width.toFixed(2)
    + '&tlen=' + fit.thumbLength.toFixed(2) + '&twid=' + fit.thumbWidth.toFixed(2);

  useEffect(() => { manualAdjustRef.current = manualAdjust; }, [manualAdjust]);
  useEffect(() => { designRef.current = design; }, [design]);
  useEffect(() => { trackedHandRef.current = trackedHand; }, [trackedHand]);
  useEffect(() => { facingModeRef.current = facingMode; }, [facingMode]);

  const stopCamera = useCallback((disposeTracker = true) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    landmarksRef.current = [];
    handednessRef.current = [];
    lastDetectionAtRef.current = 0;
    lastVideoTimeRef.current = -1;
    smootherRef.current.reset();
    targetRectsRef.current = null;
    displayRectsRef.current = {};
    mappedLandmarksRef.current = null;
    lastHandCenterRef.current = null;
    handLostAtRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (disposeTracker) disposeHandTracker();
  }, []);

  const getVideoDevices = useCallback(async () =>
    (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput'), []);

  const startCamera = useCallback(async (requestedMode = facingModeRef.current) => {
    setStatus('loading');
    setErrorMsg('');

    try {
      stopCamera(false);
      await initHandTracker();

      const devices = await getVideoDevices();
      const labelled = devices.filter((device) => device.label);
      let constraints = {
        video: {
          facingMode: { exact: requestedMode },
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      };

      if (labelled.length > 1) {
        const regex = requestedMode === 'environment'
          ? /back|rear|environment|trasera|posterior/i
          : /front|user|facetime|frontal|delantera/i;
        const matching = labelled.find((device) => regex.test(device.label));
        if (matching) {
          constraints.video = {
            deviceId: { exact: matching.deviceId },
            width: { ideal: 960 },
            height: { ideal: 540 },
            frameRate: { ideal: 30, max: 30 }
          };
        }
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: requestedMode },
            width: { ideal: 960 },
            height: { ideal: 540 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: false
        });
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.() || {};
      const actualMode = settings.facingMode || requestedMode;
      facingModeRef.current = actualMode;
      setFacingMode(actualMode);
      setCameraName(actualMode === 'environment' ? 'Cámara trasera' : 'Cámara frontal');

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      resizeOverlayCanvas();

      setStatus('running');
      renderLoop();
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Actívalo en los ajustes del navegador.'
        : 'No se pudo acceder a la cámara. Prueba de nuevo o cambia el permiso de cámara.');
    }
  }, [getVideoDevices, stopCamera]);

  function resetTracking() {
    smootherRef.current.reset();
    targetRectsRef.current = null;
    displayRectsRef.current = {};
    mappedLandmarksRef.current = null;
    lastHandCenterRef.current = null;
    handLostAtRef.current = 0;
  }

  function pushDebug(info, now) {
    if (now - lastDebugAtRef.current < DEBUG_INTERVAL_MS) return;
    lastDebugAtRef.current = now;
    setDebugInfo(info);
  }

  // Se ejecuta SOLO cuando hay una detección nueva: elige la mano del diseño,
  // estima las uñas y las filtra con el timestamp real de la detección.
  function processDetection(video, canvas, ts) {
    const activeDesign = designRef.current;
    const hands = landmarksRef.current;
    const handednessResults = handednessRef.current;
    const isFrontCamera = facingModeRef.current === 'user';
    let chosenIndex = -1;
    for (let i = 0; i < hands.length; i += 1) {
      const label = handednessResults[i]?.[0]?.categoryName;
      const resolved = label ? resolveHandedness(label, isFrontCamera) : null;
      if (resolved === trackedHandRef.current) { chosenIndex = i; break; }
    }
    if (chosenIndex < 0 && hands.length && lastHandCenterRef.current) {
      let bestDistance = Infinity;
      hands.forEach((hand, index) => {
        const wrist = hand?.[0];
        if (!wrist) return;
        const distance = Math.hypot(wrist.x - lastHandCenterRef.current.x, wrist.y - lastHandCenterRef.current.y);
        if (distance < bestDistance) { bestDistance = distance; chosenIndex = index; }
      });
    }
    if (chosenIndex < 0 && hands.length) chosenIndex = 0;
    const landmarks = chosenIndex >= 0 ? hands[chosenIndex] : null;

    if (!landmarks) {
      if (!handLostAtRef.current) handLostAtRef.current = ts;
      if (debugEnabled) pushDebug({ hands: hands.length, chosen: chosenIndex, rects: 0, video: video.videoWidth + 'x' + video.videoHeight, canvas: canvas.width + 'x' + canvas.height }, ts);
      return;
    }

    // El vídeo usa object-fit: cover: mapeamos las coordenadas normalizadas de
    // MediaPipe al área visible del canvas.
    const mapped = mapLandmarksToCover(landmarks, video.videoWidth, video.videoHeight, canvas.width, canvas.height);
    const size = { width: canvas.width, height: canvas.height };
    const rectsRaw = estimateHandNailRects(mapped, activeDesign, size);
    const scale = handSizePx(mapped, size);
    handLostAtRef.current = 0;
    if (mapped[0]) lastHandCenterRef.current = { x: mapped[0].x, y: mapped[0].y };
    mappedLandmarksRef.current = mapped;

    const targets = {};
    for (const nail of activeDesign.nails) {
      const smoothed = smootherRef.current.smooth(nail.finger, rectsRaw[nail.finger], ts, {
        scale,
        rebuild: (r) => buildNailContour(nail.shape, r.width, r.height, nail.finger),
      });
      if (smoothed) targets[nail.finger] = smoothed;
    }
    targetRectsRef.current = targets;

    if (debugEnabled) {
      pushDebug({
        hands: hands.length,
        chosen: chosenIndex,
        rects: Object.keys(targets).length,
        video: video.videoWidth + 'x' + video.videoHeight,
        canvas: canvas.width + 'x' + canvas.height,
      }, ts);
    }
  }

  function drawDebugLandmarks(ctx, canvas) {
    const mapped = mappedLandmarksRef.current;
    if (!mapped) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255,0,0,.85)';
    for (const point of mapped) {
      ctx.beginPath(); ctx.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, Math.PI * 2); ctx.fill();
    }
    // DIP en azul y punta (TIP) en amarillo: sirven para ver si el desajuste
    // viene de los landmarks o de las constantes de nailGeometry.js.
    for (const finger of Object.values(FINGER_LANDMARKS)) {
      for (const [index, color] of [[finger.dip, '#00aaff'], [finger.tip, '#ffe600']]) {
        const point = mapped[index];
        if (!point) continue;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function renderLoop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');

    function tick(now) {
      if (video.readyState >= 2) {
        let detectedThisFrame = false;
        if (
          now - lastDetectionAtRef.current >= DETECTION_INTERVAL_MS
          && video.currentTime !== lastVideoTimeRef.current
        ) {
          try {
            // MediaPipe exige timestamps estrictamente crecientes. video.currentTime
            // vuelve a 0 al cambiar de cámara (nuevo MediaStream) y rompía la
            // detección; performance.now() es monótono, y se fuerza +1 ms por si acaso.
            const ts = Math.max(now, lastTimestampRef.current + 1);
            lastTimestampRef.current = ts;
            const result = detectForVideo(video, ts);
            landmarksRef.current = result.landmarks || [];
            handednessRef.current = result.handedness || result.handednesses || [];
            lastVideoTimeRef.current = video.currentTime;
            lastDetectionAtRef.current = now;
            detectedThisFrame = true;
            setStatus(landmarksRef.current.length ? 'running' : 'no-hand');
          } catch (detectionError) {
            console.error('Error detectando la mano:', detectionError);
            lastDetectionAtRef.current = now;
          }
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (detectedThisFrame) processDetection(video, canvas, now);

        const targets = targetRectsRef.current;
        const lostAt = handLostAtRef.current;
        if (targets && lostAt && now - lostAt >= HAND_LOST_GRACE_MS) {
          resetTracking();
        } else if (targets) {
          const dt = lastFrameAtRef.current ? now - lastFrameAtRef.current : 16;
          const alpha = 1 - Math.exp(-dt / DISPLAY_TAU_MS);
          const activeDesign = designRef.current;
          for (const nail of activeDesign.nails) {
            const target = targets[nail.finger];
            if (!target) continue;
            const shown = interpolateRect(
              displayRectsRef.current[nail.finger],
              target,
              alpha,
              (r) => buildNailContour(nail.shape, r.width, r.height, nail.finger),
            );
            displayRectsRef.current[nail.finger] = shown;
            const adjusted = applyManualAdjust(shown, manualAdjustRef.current, canvas);
            drawNailDesign(ctx, adjusted, nail, manualAdjustRef.current.opacity);
          }
        }
        if (debugEnabled) drawDebugLandmarks(ctx, canvas);
        lastFrameAtRef.current = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    tick(performance.now());
  }

  function resizeOverlayCanvas() {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  useEffect(() => {
    const handleResize = () => resizeOverlayCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => () => stopCamera(true), [stopCamera]);

  async function toggleFacing() {
    const nextMode = facingModeRef.current === 'user' ? 'environment' : 'user';
    facingModeRef.current = nextMode;
    setFacingMode(nextMode);
    await startCamera(nextMode);
  }

  function captureScreenshot() {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(video, 0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    return out.toDataURL('image/png');
  }

  function handleCaptureAndShare() {
    const dataUrl = captureScreenshot();
    const link = document.createElement('a');
    link.download = 'diseno-unas.png';
    link.href = dataUrl;
    link.click();
    if (navigator.share) {
      fetch(dataUrl).then((response) => response.blob()).then((blob) => {
        const file = new File([blob], 'diseno-unas.png', { type: 'image/png' });
        navigator.share({ files: [file], title: 'Mi diseño de uñas' }).catch(() => {});
      });
    }
  }

  return (
    <div className="ar-camera">
      <div ref={viewportRef} className="ar-camera__viewport">
        <video ref={videoRef} playsInline muted style={{ display: status === 'idle' ? 'none' : 'block' }} />
        <canvas ref={canvasRef} className="ar-overlay" />
        {status === 'no-hand' && <div className="ar-hint">Acerca la mano a la cámara.</div>}
        {status === 'loading' && <div className="ar-hint">Preparando cámara…</div>}
        {status === 'error' && <div className="ar-hint ar-hint--error">{errorMsg}</div>}
        {debugEnabled && <div style={{position:'absolute',zIndex:10,left:8,top:8,padding:'6px 8px',background:'rgba(0,0,0,.72)',color:'#fff',font:'12px monospace',borderRadius:6,pointerEvents:'none'}}>AR debug · manos {debugInfo.hands} · elegida {debugInfo.chosen} · uñas {debugInfo.rects}<br/>{debugInfo.video} · {debugInfo.canvas}</div>}

        {status !== 'idle' && status !== 'error' && (
          <div className="ar-live-adjust">
            <label>
              <span>X <b>{manualAdjust.offsetX}</b></span>
              <input aria-label="Ajuste horizontal" type="range" min="-12" max="12" step="0.5" value={manualAdjust.offsetX}
                onChange={(e) => setManualAdjust((a) => ({ ...a, offsetX: Number(e.target.value) }))} />
            </label>
            <label>
              <span>Y <b>{manualAdjust.offsetY}</b></span>
              <input aria-label="Ajuste vertical" type="range" min="-12" max="12" step="0.5" value={manualAdjust.offsetY}
                onChange={(e) => setManualAdjust((a) => ({ ...a, offsetY: Number(e.target.value) }))} />
            </label>
          </div>
        )}
      </div>

      {status === 'idle' && (
        <button type="button" className="primary ar-start-button" onClick={() => startCamera('environment')}>
          Activar cámara trasera
        </button>
      )}

      {status !== 'idle' && (
        <div className="ar-controls">
          <div className="ar-camera-actions">
            <button type="button" className="primary ar-camera-switch" onClick={toggleFacing} disabled={status === 'loading'}>
              {status === 'loading' ? 'Cambiando…' : 'Cambiar a ' + (facingMode === 'user' ? 'trasera' : 'frontal')}
            </button>
            <button type="button" onClick={handleCaptureAndShare}>Capturar</button>
          </div>
          <span className="ar-camera-current">{cameraName} · ajuste automático activo</span>

          {debugEnabled && (
            <div style={{ background: '#fff', border: '1px solid #DDE7D2', borderRadius: 12, padding: '9px 11px', display: 'grid', gap: 6 }}>
              <strong style={{ color: '#082D05', fontSize: '.82rem' }}>Encaje de uñas (solo debug)</strong>
              {[
                ['shift', 'Desplazar a la punta', -0.2, 0.9, 0.01],
                ['length', 'Largo', 0.6, 1.6, 0.01],
                ['width', 'Ancho', 0.6, 1.6, 0.01],
                ['thumbLength', 'Largo pulgar (extra)', 0.4, 1.4, 0.01],
                ['thumbWidth', 'Ancho pulgar (extra)', 0.4, 1.4, 0.01],
              ].map(([key, label, min, max, step]) => (
                <label key={key} style={{ display: 'grid', gap: 2, fontSize: '.8rem' }}>
                  <span>{label}: <b>{fit[key].toFixed(2)}</b></span>
                  <input type="range" min={min} max={max} step={step} value={fit[key]}
                    onChange={(e) => updateFit(key, Number(e.target.value))} />
                </label>
              ))}
              <code style={{ fontSize: '.75rem', wordBreak: 'break-all', userSelect: 'all' }}>?debug=1&{fitQuery}</code>
            </div>
          )}

          <details className="ar-fine-tune">
            <summary>Ajuste fino</summary>
            <label>Tamaño
              <input type="range" min="0.75" max="1.25" step="0.01" value={manualAdjust.scale}
                onChange={(e) => setManualAdjust((a) => ({ ...a, scale: Number(e.target.value) }))} />
            </label>
            <label>Rotación
              <input type="range" min="-20" max="20" step="0.5" value={manualAdjust.rotation}
                onChange={(e) => setManualAdjust((a) => ({ ...a, rotation: Number(e.target.value) }))} />
            </label>
            <label>Transparencia
              <input type="range" min="0.5" max="1" step="0.05" value={manualAdjust.opacity}
                onChange={(e) => setManualAdjust((a) => ({ ...a, opacity: Number(e.target.value) }))} />
            </label>
          </details>
        </div>
      )}
    </div>
  );
}

function applyManualAdjust(rect, adjust, canvas) {
  const scale = adjust.scale;
  const contour = rect.contour
    ? Object.fromEntries(
        Object.entries(rect.contour).map(([key, value]) => (
          key === 'cuticleCurve'
            ? [key, value * scale]
            : [key, { x: value.x * scale, y: value.y * scale }]
        )),
      )
    : rect.contour;

  return {
    ...rect,
    x: rect.x + (adjust.offsetX / 100) * canvas.width,
    y: rect.y + (adjust.offsetY / 100) * canvas.height,
    width: rect.width * scale,
    height: rect.height * scale,
    angle: rect.angle + (adjust.rotation * Math.PI) / 180,
    contour,
  };
}
