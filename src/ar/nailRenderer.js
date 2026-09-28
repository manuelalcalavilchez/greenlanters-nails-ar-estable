import { drawSvgNailDesign } from './svgDesignRenderer';

// nailRenderer.js
// Dibuja el diseño de cada uña sobre un canvas 2D, en la posición/rotación
// dada por nailGeometry.js. Los patrones y adornos se renderizan en el
// espacio local de cada uña para acompañar el seguimiento de la mano.

function applyNailPath(ctx, rect) {
  if (rect.contour?.baseLeft) {
    const c = rect.contour;
    ctx.beginPath();
    ctx.moveTo(c.baseLeft.x, c.baseLeft.y);
    ctx.quadraticCurveTo(
      -rect.width * 0.12,
      c.baseLeft.y - c.cuticleCurve,
      0,
      c.baseLeft.y - c.cuticleCurve * 1.15,
    );
    ctx.quadraticCurveTo(
      rect.width * 0.12,
      c.baseRight.y - c.cuticleCurve,
      c.baseRight.x,
      c.baseRight.y,
    );
    ctx.bezierCurveTo(
      c.rightControl1.x,
      c.rightControl1.y,
      c.rightControl2.x,
      c.rightControl2.y,
      c.tipRight.x,
      c.tipRight.y,
    );
    ctx.quadraticCurveTo(
      rect.width * 0.08,
      c.tipRight.y - rect.height * 0.035,
      0,
      c.tipRight.y,
    );
    ctx.quadraticCurveTo(
      -rect.width * 0.08,
      c.tipLeft.y - rect.height * 0.035,
      c.tipLeft.x,
      c.tipLeft.y,
    );
    ctx.bezierCurveTo(
      c.leftControl2.x,
      c.leftControl2.y,
      c.leftControl1.x,
      c.leftControl1.y,
      c.baseLeft.x,
      c.baseLeft.y,
    );
    ctx.closePath();
    return;
  }

  const w = rect.width / 2;
  const h = rect.height / 2;
  const curve = h * rect.tipCurve;

  ctx.beginPath();
  ctx.moveTo(-w, h);
  ctx.lineTo(-w, -h + curve);
  ctx.quadraticCurveTo(-w, -h, 0, -h - curve * 0.3);
  ctx.quadraticCurveTo(w, -h, w, -h + curve);
  ctx.lineTo(w, h);
  ctx.closePath();
}

function seededRandom(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function hexToRgba(hex, alpha = 1) {
  const safeHex = (hex || '#FFFFFF').replace('#', '');
  const normalized = safeHex.length === 3
    ? safeHex.split('').map((char) => char + char).join('')
    : safeHex.padEnd(6, 'F').slice(0, 6);
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function paintGloss(ctx, x, y, w, h, strength = 0.26) {
  const gloss = ctx.createLinearGradient(x, y, x + w, y + h * 0.65);
  gloss.addColorStop(0, `rgba(255,255,255,${strength})`);
  gloss.addColorStop(0.26, `rgba(255,255,255,${strength * 0.34})`);
  gloss.addColorStop(0.58, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(x, y, w, h * 0.7);
}

function paintGlitter(ctx, x, y, w, h, color = '#FFFFFF', density = 34) {
  for (let i = 0; i < density; i += 1) {
    const px = x + seededRandom(i + w * 3) * w;
    const py = y + seededRandom(i + h * 7 + 19) * h;
    const size = 0.55 + seededRandom(i + 39) * 1.65;
    ctx.fillStyle = hexToRgba(color, 0.42 + seededRandom(i + 91) * 0.5);
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintSwirls(ctx, x, y, w, h, color = '#049B45') {
  ctx.save();
  ctx.strokeStyle = hexToRgba(color, 0.82);
  ctx.lineWidth = Math.max(1.1, w * 0.095);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i += 1) {
    const offset = (i - 1) * w * 0.24;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1 + offset, y + h * 0.95);
    ctx.bezierCurveTo(
      x + w * 0.05 + offset, y + h * 0.66,
      x + w * 0.92 + offset, y + h * 0.47,
      x + w * 0.78 + offset, y + h * 0.04,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function paintGoldLeaf(ctx, x, y, w, h) {
  ctx.save();
  for (let i = 0; i < 12; i += 1) {
    const px = x + seededRandom(i + 7) * w;
    const py = y + seededRandom(i + 71) * h;
    const size = Math.max(1.5, w * (0.1 + seededRandom(i + 31) * 0.14));
    ctx.fillStyle = i % 2 ? '#D4AF37' : '#F7D979';
    ctx.globalAlpha = 0.5 + seededRandom(i + 53) * 0.4;
    ctx.beginPath();
    ctx.moveTo(px, py - size);
    ctx.lineTo(px + size * 0.8, py - size * 0.25);
    ctx.lineTo(px + size * 0.35, py + size);
    ctx.lineTo(px - size * 0.85, py + size * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function paintFloral(ctx, x, y, w, h) {
  const cx = x + w * 0.52;
  const cy = y + h * 0.46;
  const radius = Math.max(2.4, w * 0.14);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  for (let i = 0; i < 5; i += 1) {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
      radius * 0.8,
      radius * 0.48,
      angle,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = '#EC6FA5';
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawNailDesign(ctx, rect, nailConfig, opacity = 1) {
  if (!rect || !nailConfig) return;

  // Los diseños SVG suministrados incluyen su propia silueta/máscara. Se
  // priorizan sobre el renderer genérico para que la forma real del diseño
  // (almond, square, stiletto, etc.) viaje con el dedo detectado.
  if (nailConfig.svgDesign) {
    const rendered = drawSvgNailDesign(ctx, rect, nailConfig.svgDesign, opacity);
    if (rendered) return;
    // Si el SVG todavía no ha cargado (o falla su carga), no dejamos la uña invisible:
    // continuamos con el renderer Canvas como fallback.
  }
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(rect.x, rect.y);
  ctx.rotate(rect.angle);

  const w = rect.width / 2;
  const h = rect.height / 2;
  applyNailPath(ctx, rect);
  ctx.clip();

  paintPattern(ctx, nailConfig, -w, -h, w * 2, h * 2);
  drawDecorations(ctx, nailConfig.decorations, -w, -h, w * 2, h * 2);
  paintGloss(ctx, -w, -h, w * 2, h * 2);
  ctx.restore();
}

function paintPattern(ctx, nailConfig, x, y, w, h) {
  const { pattern, baseColor, tipColor, gradient } = nailConfig;

  switch (pattern) {
    case 'gradient': {
      const radians = ((gradient?.angle ?? 135) * Math.PI) / 180;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const length = Math.sqrt(w * w + h * h) / 2;
      const g = ctx.createLinearGradient(
        cx - Math.cos(radians) * length,
        cy - Math.sin(radians) * length,
        cx + Math.cos(radians) * length,
        cy + Math.sin(radians) * length,
      );
      g.addColorStop(0, gradient?.from || baseColor);
      g.addColorStop(1, gradient?.to || '#FFFFFF');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      break;
    }
    case 'french': {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, h);
      const tipGradient = ctx.createLinearGradient(x, y, x, y + h * 0.34);
      tipGradient.addColorStop(0, tipColor || '#FFFFFF');
      tipGradient.addColorStop(1, hexToRgba(tipColor || '#FFFFFF', 0.88));
      ctx.fillStyle = tipGradient;
      ctx.fillRect(x, y, w, h * 0.29);
      break;
    }
    case 'chrome': {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.18, baseColor);
      g.addColorStop(0.47, '#FFFFFF');
      g.addColorStop(0.72, baseColor);
      g.addColorStop(1, '#B8B8B8');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      break;
    }
    case 'glitter': {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, h);
      paintGlitter(ctx, x, y, w, h, '#FFFFFF', 38);
      break;
    }
    case 'swirl': {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, gradient?.from || baseColor);
      g.addColorStop(1, gradient?.to || '#42D84A');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      paintSwirls(ctx, x, y, w, h);
      break;
    }
    case 'gold-leaf': {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, h);
      paintGoldLeaf(ctx, x, y, w, h);
      break;
    }
    case 'floral': {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, h);
      paintFloral(ctx, x, y, w, h);
      break;
    }
    case 'solid':
    default: {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, h);
    }
  }
}

function drawFlower(ctx, color, accent, size) {
  for (let i = 0; i < 5; i += 1) {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(Math.cos(angle) * size * 0.72, Math.sin(angle) * size * 0.72, size * 0.58, size * 0.32, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = accent || '#F2C94C';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrystal(ctx, color, size) {
  const gradient = ctx.createRadialGradient(-size * 0.25, -size * 0.3, 0, 0, 0, size);
  gradient.addColorStop(0, '#FFFFFF');
  gradient.addColorStop(0.38, color);
  gradient.addColorStop(1, '#6A8FB9');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.8, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.8, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = Math.max(0.55, size * 0.12);
  ctx.stroke();
}

function drawPearl(ctx, color, size) {
  const gradient = ctx.createRadialGradient(-size * 0.3, -size * 0.34, size * 0.08, 0, 0, size);
  gradient.addColorStop(0, '#FFFFFF');
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, '#B9AEBB');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
}

const imageCache = new Map();

function getDecorationImage(src) {
  if (!src) return null;
  const cached = imageCache.get(src);
  if (cached) return cached;
  const image = new Image();
  image.onload = () => imageCache.set(src, image);
  image.src = src;
  imageCache.set(src, image);
  return image;
}

function drawDecorations(ctx, decorations = [], x, y, w, h) {
  for (const deco of decorations) {
    const px = x + (deco.x ?? 0.5) * w;
    const py = y + (deco.y ?? 0.5) * h;
    const scale = deco.scale || 1;
    const size = Math.max(1.8, Math.min(w, h) * 0.14 * scale);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(((deco.rotation || 0) * Math.PI) / 180);
    if (deco.type === 'dot') {
      ctx.fillStyle = deco.color || '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (deco.type === 'line') {
      ctx.strokeStyle = deco.color || '#FFFFFF';
      ctx.lineWidth = Math.max(1, size * 0.35);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-size * 1.4, 0);
      ctx.lineTo(size * 1.4, 0);
      ctx.stroke();
    } else if (deco.type === 'glitter') {
      paintGlitter(ctx, -size * 2, -size * 2, size * 4, size * 4, deco.color || '#FFFFFF', 12 + Math.round((deco.intensity || 0.5) * 18));
    } else if (deco.type === 'gold') {
      paintGoldLeaf(ctx, -size * 1.8, -size * 1.8, size * 3.6, size * 3.6);
    } else if (deco.type === 'flower') {
      drawFlower(ctx, deco.color || '#FFFFFF', deco.accent || '#EC6FA5', size);
    } else if (deco.type === 'crystal' || deco.type === 'stone') {
      drawCrystal(ctx, deco.color || '#B7D8FF', size);
    } else if (deco.type === 'pearl') {
      drawPearl(ctx, deco.color || '#FFFFFF', size);
    } else if (deco.type === 'image') {
      const image = getDecorationImage(deco.src);
      if (image?.complete && image.naturalWidth > 0) {
        ctx.globalAlpha *= 0.98;
        if (deco.mode === 'template-nail') {
          const slot = Math.max(0, Math.min(4, deco.slot ?? 0));
          const sourceW = deco.templateWidth || image.naturalWidth;
          const sourceH = deco.templateHeight || image.naturalHeight;
          const slotW = sourceW / 5;
          const sx = slot * slotW;
          const sy = sourceH * 0.16;
          const sh = sourceH * 0.70;
          ctx.drawImage(image, sx, sy, slotW, sh, x, y, w, h);
        } else {
          const imageSize = size * 2.8;
          const ratio = image.naturalWidth / image.naturalHeight || 1;
          const drawW = ratio >= 1 ? imageSize : imageSize * ratio;
          const drawH = ratio >= 1 ? imageSize / ratio : imageSize;
          ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
        }
      }
    }
    ctx.restore();
  }
}

export { paintPattern };