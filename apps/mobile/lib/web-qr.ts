import jsQR from 'jsqr';

/**
 * Checks if the browser natively supports the hardware-accelerated BarcodeDetector API.
 */
export function hasNativeBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Tries decoding all QR codes using the browser's native BarcodeDetector API.
 * Returns array of decoded strings, or empty array if unsupported / no QR code detected.
 */
export async function detectAllWithNativeBarcodeDetector(
  source: ImageBitmapSource | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<string[]> {
  if (!hasNativeBarcodeDetector()) {
    return [];
  }
  try {
    const BarcodeDetectorClass = (window as unknown as {
      BarcodeDetector: new (opts: { formats: string[] }) => {
        detect: (s: unknown) => Promise<Array<{ rawValue?: string }>>;
      };
    }).BarcodeDetector;
    const detector = new BarcodeDetectorClass({ formats: ['qr_code'] });
    const barcodes = await detector.detect(source);
    if (barcodes && Array.isArray(barcodes)) {
      const unique = new Set<string>();
      for (const b of barcodes) {
        if (b?.rawValue && b.rawValue.trim()) {
          unique.add(b.rawValue.trim());
        }
      }
      return Array.from(unique);
    }
  } catch {
    // Silently fall back
  }
  return [];
}

/**
 * Tries decoding a single QR code using the browser's native BarcodeDetector API.
 * Returns decoded text if successful, or null if unsupported / no QR code detected.
 */
export async function detectWithNativeBarcodeDetector(
  source: ImageBitmapSource | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<string | null> {
  const all = await detectAllWithNativeBarcodeDetector(source);
  return all.length > 0 ? (all[0] ?? null) : null;
}

/**
 * Extracts a rectangular subregion of an RGBA pixel buffer.
 */
export function extractSubRegion(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  x: number,
  y: number,
  w: number,
  h: number
): { data: Uint8ClampedArray; width: number; height: number } {
  const clampX = Math.max(0, Math.min(srcW - 1, x));
  const clampY = Math.max(0, Math.min(srcH - 1, y));
  const clampW = Math.max(1, Math.min(srcW - clampX, w));
  const clampH = Math.max(1, Math.min(srcH - clampY, h));

  const out = new Uint8ClampedArray(clampW * clampH * 4);
  for (let row = 0; row < clampH; row++) {
    const srcRowOffset = (clampY + row) * srcW + clampX;
    const destRowOffset = row * clampW;
    out.set(src.subarray(srcRowOffset * 4, (srcRowOffset + clampW) * 4), destRowOffset * 4);
  }
  return { data: out, width: clampW, height: clampH };
}

/**
 * Decodes all QR codes from raw RGBA pixel data using iterative bounding-box masking with jsQR
 * and spatial decomposition.
 * Handles:
 * - Single isolated QR codes
 * - Multiple QR codes in a single frame (e.g. side-by-side merchant standees, stacked stickers)
 * - Automatic deduplication of identical QR codes
 */
export function decodeAllQrFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxCodes = 6
): string[] {
  const results: string[] = [];

  function scanBuffer(buf: Uint8ClampedArray, w: number, h: number) {
    const workBuf = new Uint8ClampedArray(buf);
    for (let iter = 0; iter < maxCodes; iter++) {
      const code = jsQR(workBuf, w, h, {
        inversionAttempts: 'attemptBoth'
      });
      if (!code || !code.data) break;

      const trimmed = code.data.trim();
      if (trimmed && !results.includes(trimmed)) {
        results.push(trimmed);
      }

      // Mask out the detected QR code bounding box so jsQR can find additional QR codes
      const loc = code.location;
      const margin = 12;
      const minX = Math.max(
        0,
        Math.floor(Math.min(loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomRightCorner.x, loc.bottomLeftCorner.x)) - margin
      );
      const maxX = Math.min(
        w - 1,
        Math.ceil(Math.max(loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomRightCorner.x, loc.bottomLeftCorner.x)) + margin
      );
      const minY = Math.max(
        0,
        Math.floor(Math.min(loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomRightCorner.y, loc.bottomLeftCorner.y)) - margin
      );
      const maxY = Math.min(
        h - 1,
        Math.ceil(Math.max(loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomRightCorner.y, loc.bottomLeftCorner.y)) + margin
      );

      for (let y = minY; y <= maxY; y++) {
        const rowOffset = y * w;
        for (let x = minX; x <= maxX; x++) {
          const idx = (rowOffset + x) * 4;
          workBuf[idx] = 255;
          workBuf[idx + 1] = 255;
          workBuf[idx + 2] = 255;
          workBuf[idx + 3] = 255;
        }
      }
    }
  }

  // Pass A: Full image buffer
  scanBuffer(data, width, height);

  // Pass B: Horizontal decomposition (for adjacent / side-by-side merchant standees)
  if (width >= 120) {
    const halfW = Math.round(width * 0.58);
    const rightX = Math.round(width * 0.42);
    const rightW = width - rightX;

    const left = extractSubRegion(data, width, height, 0, 0, halfW, height);
    scanBuffer(left.data, left.width, left.height);

    const right = extractSubRegion(data, width, height, rightX, 0, rightW, height);
    scanBuffer(right.data, right.width, right.height);

    // Overlapping thirds decomposition for multiple codes in a row (e.g. 3 payment standees)
    if (width >= 200) {
      const t1W = Math.round(width * 0.38);
      const leftThird = extractSubRegion(data, width, height, 0, 0, t1W, height);
      scanBuffer(leftThird.data, leftThird.width, leftThird.height);

      const t2X = Math.round(width * 0.28);
      const t2W = Math.round(width * 0.44);
      const midThird = extractSubRegion(data, width, height, t2X, 0, t2W, height);
      scanBuffer(midThird.data, midThird.width, midThird.height);

      const t3X = Math.round(width * 0.62);
      const t3W = width - t3X;
      const rightThird = extractSubRegion(data, width, height, t3X, 0, t3W, height);
      scanBuffer(rightThird.data, rightThird.width, rightThird.height);
    }
  }

  // Pass C: Vertical decomposition (for stacked stickers or counter posters)
  if (height >= 120) {
    const halfH = Math.round(height * 0.58);
    const botY = Math.round(height * 0.42);
    const botH = height - botY;

    const top = extractSubRegion(data, width, height, 0, 0, width, halfH);
    scanBuffer(top.data, top.width, top.height);

    const bot = extractSubRegion(data, width, height, 0, botY, width, botH);
    scanBuffer(bot.data, bot.width, bot.height);

    if (height >= 200) {
      const t2Y = Math.round(height * 0.28);
      const t2H = Math.round(height * 0.44);
      const t3Y = Math.round(height * 0.58);
      const t3H = height - t3Y;

      const midThird = extractSubRegion(data, width, height, 0, t2Y, width, t2H);
      scanBuffer(midThird.data, midThird.width, midThird.height);

      const botThird = extractSubRegion(data, width, height, 0, t3Y, width, t3H);
      scanBuffer(botThird.data, botThird.width, botThird.height);
    }
  }

  // Pass D: Quadrant decomposition for 2x2 grid arrangements
  if (width >= 200 && height >= 200) {
    const qW = Math.round(width * 0.58);
    const qH = Math.round(height * 0.58);
    const qRX = Math.round(width * 0.42);
    const qBY = Math.round(height * 0.42);

    const tl = extractSubRegion(data, width, height, 0, 0, qW, qH);
    scanBuffer(tl.data, tl.width, tl.height);

    const tr = extractSubRegion(data, width, height, qRX, 0, width - qRX, qH);
    scanBuffer(tr.data, tr.width, tr.height);

    const bl = extractSubRegion(data, width, height, 0, qBY, qW, height - qBY);
    scanBuffer(bl.data, bl.width, bl.height);

    const br = extractSubRegion(data, width, height, qRX, qBY, width - qRX, height - qBY);
    scanBuffer(br.data, br.width, br.height);
  }

  return results;
}

/**
 * Decodes single QR code from raw RGBA pixel data using jsQR with bidirectional inversion.
 */
export function decodeQrFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  const codes = decodeAllQrFromImageData(data, width, height, 1);
  return codes.length > 0 ? (codes[0] ?? null) : null;
}

/**
 * Rotates raw RGBA pixel data by 90, 180, or 270 degrees in pure memory (DOM-independent).
 */
export function rotateImageData(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  degrees: 90 | 180 | 270
): { data: Uint8ClampedArray; width: number; height: number } {
  const newWidth = degrees === 90 || degrees === 270 ? height : width;
  const newHeight = degrees === 90 || degrees === 270 ? width : height;
  const out = new Uint8ClampedArray(newWidth * newHeight * 4);

  for (let y = 0; y < height; y++) {
    const srcRow = y * width;
    for (let x = 0; x < width; x++) {
      let destX = 0;
      let destY = 0;

      if (degrees === 90) {
        destX = height - 1 - y;
        destY = x;
      } else if (degrees === 180) {
        destX = width - 1 - x;
        destY = height - 1 - y;
      } else if (degrees === 270) {
        destX = y;
        destY = width - 1 - x;
      }

      const srcIdx = (srcRow + x) * 4;
      const destIdx = (destY * newWidth + destX) * 4;

      out[destIdx] = src[srcIdx] ?? 0;
      out[destIdx + 1] = src[srcIdx + 1] ?? 0;
      out[destIdx + 2] = src[srcIdx + 2] ?? 0;
      out[destIdx + 3] = src[srcIdx + 3] ?? 255;
    }
  }

  return { data: out, width: newWidth, height: newHeight };
}

/**
 * 2x nearest-neighbor upscaling of raw RGBA pixel data in pure memory.
 * Preserves crisp module boundaries for small / low-resolution QR codes.
 */
export function scaleImageData2x(
  src: Uint8ClampedArray,
  width: number,
  height: number
): { data: Uint8ClampedArray; width: number; height: number } {
  const newWidth = width * 2;
  const newHeight = height * 2;
  const out = new Uint8ClampedArray(newWidth * newHeight * 4);

  for (let y = 0; y < height; y++) {
    const srcRow = y * width;
    const destRow1 = y * 2 * newWidth;
    const destRow2 = (y * 2 + 1) * newWidth;

    for (let x = 0; x < width; x++) {
      const srcIdx = (srcRow + x) * 4;
      const r = src[srcIdx] ?? 0;
      const g = src[srcIdx + 1] ?? 0;
      const b = src[srcIdx + 2] ?? 0;
      const a = src[srcIdx + 3] ?? 255;

      const destX = x * 2;
      const idx1 = (destRow1 + destX) * 4;
      const idx2 = (destRow1 + destX + 1) * 4;
      const idx3 = (destRow2 + destX) * 4;
      const idx4 = (destRow2 + destX + 1) * 4;

      out[idx1] = r; out[idx1 + 1] = g; out[idx1 + 2] = b; out[idx1 + 3] = a;
      out[idx2] = r; out[idx2 + 1] = g; out[idx2 + 2] = b; out[idx2 + 3] = a;
      out[idx3] = r; out[idx3 + 1] = g; out[idx3 + 2] = b; out[idx3 + 3] = a;
      out[idx4] = r; out[idx4 + 1] = g; out[idx4 + 2] = b; out[idx4 + 3] = a;
    }
  }

  return { data: out, width: newWidth, height: newHeight };
}

/**
 * Downscales large raw RGBA pixel data to a maximum dimension in pure memory.
 * Preserves module structure and accelerates decoding of large camera photos.
 */
export function downscaleImageData(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  maxDim = 1024
): { data: Uint8ClampedArray; width: number; height: number } {
  if (width <= maxDim && height <= maxDim) {
    return { data: src, width, height };
  }
  const scale = Math.min(maxDim / width, maxDim / height);
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));
  const out = new Uint8ClampedArray(targetW * targetH * 4);

  const xRatio = width / targetW;
  const yRatio = height / targetH;

  for (let y = 0; y < targetH; y++) {
    const srcY = Math.min(height - 1, Math.floor(y * yRatio));
    const srcRow = srcY * width;
    const destRow = y * targetW;

    for (let x = 0; x < targetW; x++) {
      const srcX = Math.min(width - 1, Math.floor(x * xRatio));
      const srcIdx = (srcRow + srcX) * 4;
      const destIdx = (destRow + x) * 4;

      out[destIdx] = src[srcIdx] ?? 0;
      out[destIdx + 1] = src[srcIdx + 1] ?? 0;
      out[destIdx + 2] = src[srcIdx + 2] ?? 0;
      out[destIdx + 3] = src[srcIdx + 3] ?? 255;
    }
  }

  return { data: out, width: targetW, height: targetH };
}

/**
 * Full multi-pass real-world QR decoder that runs on raw RGBA pixel buffers
 * completely decoupled from DOM / canvas APIs (100% runnable in headless Node.js tests).
 * Evaluates:
 * 0. Downscaling for large images (> 1024px)
 * 1. Base image decoding with spatial decomposition
 * 2. 2x nearest-neighbor upscaling for small images (< 500px)
 * 3. Linear contrast stretching (underexposed/faded/washed-out photos)
 * 4. Bradley-Roth local adaptive thresholding (laminated standee specular reflections/glare/shadows)
 * 5. Center-weighted 65% ROI crop
 * 6. Rotations (90°, 180°, 270°) with contrast stretching and adaptive thresholding
 */
export function decodeAllQrFromImageBuffer(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): string[] {
  const found = new Set<string>();

  // Pass 0: Downscale if image is very large (> 1024px)
  if (width > 1024 || height > 1024) {
    const downscaled = downscaleImageData(pixels, width, height, 1024);
    const p0 = decodeAllQrFromImageData(downscaled.data, downscaled.width, downscaled.height);
    for (const c of p0) found.add(c);
    if (found.size > 0) return Array.from(found);

    const dsStretched = applyContrastStretch(downscaled.data, downscaled.width, downscaled.height);
    const p0b = decodeAllQrFromImageData(dsStretched, downscaled.width, downscaled.height);
    for (const c of p0b) found.add(c);
    if (found.size > 0) return Array.from(found);
  }

  // Pass 1: Standard multi-QR decoding with spatial decomposition
  const p1 = decodeAllQrFromImageData(pixels, width, height);
  for (const c of p1) found.add(c);
  if (found.size > 0) return Array.from(found);

  // Pass 2: 2x upscaling for small QR images (< 500px)
  if (width < 500 && height < 500) {
    const upscaled = scaleImageData2x(pixels, width, height);
    const p2 = decodeAllQrFromImageData(upscaled.data, upscaled.width, upscaled.height);
    for (const c of p2) found.add(c);
    if (found.size > 0) return Array.from(found);
  }

  // Pass 3: Linear contrast stretching (recovers low-contrast / washed-out standee prints)
  const stretched = applyContrastStretch(pixels, width, height);
  const p3 = decodeAllQrFromImageData(stretched, width, height);
  for (const c of p3) found.add(c);
  if (found.size > 0) return Array.from(found);

  // Pass 4: Bradley-Roth adaptive thresholding (recovers blurred modules & glare)
  const adaptive = applyAdaptiveThreshold(pixels, width, height);
  const p4 = decodeAllQrFromImageData(adaptive, width, height);
  for (const c of p4) found.add(c);
  if (found.size > 0) return Array.from(found);

  // Pass 5: Center-weighted 65% ROI crop
  const cropW = Math.round(width * 0.65);
  const cropH = Math.round(height * 0.65);
  const cropX = Math.round((width - cropW) / 2);
  const cropY = Math.round((height - cropH) / 2);
  const centerCrop = extractSubRegion(pixels, width, height, cropX, cropY, cropW, cropH);
  const p5 = decodeAllQrFromImageData(centerCrop.data, centerCrop.width, centerCrop.height);
  for (const c of p5) found.add(c);
  if (found.size > 0) return Array.from(found);

  const centerAdaptive = applyAdaptiveThreshold(centerCrop.data, centerCrop.width, centerCrop.height);
  const p5b = decodeAllQrFromImageData(centerAdaptive, centerCrop.width, centerCrop.height);
  for (const c of p5b) found.add(c);
  if (found.size > 0) return Array.from(found);

  // Pass 6: Rotations (90°, 180°, 270°) to recover sideways or inverted photos
  for (const deg of [90, 180, 270] as const) {
    const rot = rotateImageData(pixels, width, height, deg);
    const pRot = decodeAllQrFromImageData(rot.data, rot.width, rot.height);
    for (const c of pRot) found.add(c);
    if (found.size > 0) return Array.from(found);

    const rotAdaptive = applyAdaptiveThreshold(rot.data, rot.width, rot.height);
    const pRotAdap = decodeAllQrFromImageData(rotAdaptive, rot.width, rot.height);
    for (const c of pRotAdap) found.add(c);
    if (found.size > 0) return Array.from(found);
  }

  // Pass 7: Tilted angles (±15°, ±10°) to recover hand-held camera tilt angles
  for (const deg of [-15, 15, -10, 10] as const) {
    const rot = rotateImageDataArbitrary(pixels, width, height, deg);
    const pRot = decodeAllQrFromImageData(rot.data, rot.width, rot.height);
    for (const c of pRot) found.add(c);
    if (found.size > 0) return Array.from(found);

    const rotAdaptive = applyAdaptiveThreshold(rot.data, rot.width, rot.height);
    const pRotAdap = decodeAllQrFromImageData(rotAdaptive, rot.width, rot.height);
    for (const c of pRotAdap) found.add(c);
    if (found.size > 0) return Array.from(found);
  }

  return Array.from(found);
}

/**
 * Rotates raw RGBA pixel data by arbitrary angle (in degrees) using bilinear interpolation
 * and filling out-of-bounds pixels with clean white (255, 255, 255, 255).
 */
export function rotateImageDataArbitrary(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  angleDegrees: number
): { data: Uint8ClampedArray; width: number; height: number } {
  const rad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const newW = Math.ceil(Math.abs(width * cos) + Math.abs(height * sin));
  const newH = Math.ceil(Math.abs(width * sin) + Math.abs(height * cos));

  const out = new Uint8ClampedArray(newW * newH * 4);
  out.fill(255);

  const cxSrc = width / 2;
  const cySrc = height / 2;
  const cxDest = newW / 2;
  const cyDest = newH / 2;

  for (let y = 0; y < newH; y++) {
    const dy = y - cyDest;
    const destRow = y * newW;

    for (let x = 0; x < newW; x++) {
      const dx = x - cxDest;

      // Inverse mapping
      const sx = cxSrc + dx * cos + dy * sin;
      const sy = cySrc - dx * sin + dy * cos;

      if (sx >= 0 && sx < width - 1 && sy >= 0 && sy < height - 1) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const fx = sx - x0;
        const fy = sy - y0;

        const destIdx = (destRow + x) * 4;
        const row0 = y0 * width;
        const row1 = y1 * width;

        for (let c = 0; c < 3; c++) {
          const p00 = src[(row0 + x0) * 4 + c] ?? 255;
          const p10 = src[(row0 + x1) * 4 + c] ?? 255;
          const p01 = src[(row1 + x0) * 4 + c] ?? 255;
          const p11 = src[(row1 + x1) * 4 + c] ?? 255;

          const top = p00 * (1 - fx) + p10 * fx;
          const bottom = p01 * (1 - fx) + p11 * fx;
          out[destIdx + c] = Math.round(top * (1 - fy) + bottom * fy);
        }
        out[destIdx + 3] = 255;
      }
    }
  }

  return { data: out, width: newW, height: newH };
}

export function decodeQrFromImageBuffer(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  const codes = decodeAllQrFromImageBuffer(pixels, width, height);
  return codes.length > 0 ? (codes[0] ?? null) : null;
}

/**
 * Creates a canvas with the specified rotation (90, 180, 270 degrees).
 */
export function createRotatedCanvas(
  sourceCanvas: HTMLCanvasElement,
  degrees: 90 | 180 | 270
): HTMLCanvasElement {
  const rotated = document.createElement('canvas');
  if (degrees === 90 || degrees === 270) {
    rotated.width = sourceCanvas.height;
    rotated.height = sourceCanvas.width;
  } else {
    rotated.width = sourceCanvas.width;
    rotated.height = sourceCanvas.height;
  }

  const ctx = rotated.getContext('2d', { willReadFrequently: true });
  if (!ctx) return rotated;

  if (degrees === 90) {
    ctx.translate(rotated.width, 0);
    ctx.rotate((90 * Math.PI) / 180);
  } else if (degrees === 180) {
    ctx.translate(rotated.width, rotated.height);
    ctx.rotate((180 * Math.PI) / 180);
  } else if (degrees === 270) {
    ctx.translate(0, rotated.height);
    ctx.rotate((270 * Math.PI) / 180);
  }

  ctx.drawImage(sourceCanvas, 0, 0);
  return rotated;
}

/**
 * Applies Bradley-Roth local adaptive thresholding using an integral image.
 * Counters non-uniform lighting, shadows, and reflection glare on laminated merchant standees.
 */
export function applyAdaptiveThreshold(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  const gray = new Uint8Array(width * height);

  // Convert to grayscale
  for (let i = 0, g = 0; i < pixels.length; i += 4, g++) {
    const r = pixels[i] ?? 0;
    const gr = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    gray[g] = Math.round(0.299 * r + 0.587 * gr + 0.114 * b);
  }

  // Build integral image (summed area table)
  const stride = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const rowOffset = y * width;
    const intRowOffset = (y + 1) * stride;
    const prevIntRowOffset = y * stride;

    for (let x = 0; x < width; x++) {
      rowSum += gray[rowOffset + x] ?? 0;
      integral[intRowOffset + (x + 1)] = integral[prevIntRowOffset + (x + 1)]! + rowSum;
    }
  }

  // Local window size: 1/8th of width (min 8)
  const S = Math.max(8, Math.round(width / 8));
  const s2 = Math.round(S / 2);
  const T = 0.15; // 15% below local mean threshold

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - s2);
    const y2 = Math.min(height - 1, y + s2);
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - s2);
      const x2 = Math.min(width - 1, x + s2);
      const count = (x2 - x1) * (y2 - y1);

      const sum =
        integral[(y2 + 1) * stride + (x2 + 1)]! -
        integral[y1 * stride + (x2 + 1)]! -
        integral[(y2 + 1) * stride + x1]! +
        integral[y1 * stride + x1]!;

      const pixelVal = gray[rowOffset + x] ?? 0;
      const isBlack = pixelVal * count <= sum * (1 - T);
      const v = isBlack ? 0 : 255;

      const pIdx = (rowOffset + x) * 4;
      out[pIdx] = v;
      out[pIdx + 1] = v;
      out[pIdx + 2] = v;
      out[pIdx + 3] = 255;
    }
  }

  return out;
}

/**
 * Applies linear contrast stretching to normalize brightness across underexposed or hazy photos.
 */
export function applyContrastStretch(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  const total = width * height;

  // Calculate histogram
  const hist = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    hist[gray]!++;
  }

  // Find 2nd and 98th percentiles
  const pLowCut = total * 0.02;
  const pHighCut = total * 0.98;

  let minVal = 0;
  let maxVal = 255;
  let count = 0;

  for (let i = 0; i < 256; i++) {
    count += hist[i]!;
    if (count >= pLowCut) {
      minVal = i;
      break;
    }
  }

  count = 0;
  for (let i = 255; i >= 0; i--) {
    count += hist[i]!;
    if (count >= total - pHighCut) {
      maxVal = i;
      break;
    }
  }

  const range = Math.max(1, maxVal - minVal);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const stretched = Math.min(255, Math.max(0, Math.round(((gray - minVal) / range) * 255)));

    out[i] = stretched;
    out[i + 1] = stretched;
    out[i + 2] = stretched;
    out[i + 3] = 255;
  }

  return out;
}

/**
 * Comprehensive multi-pass real-world QR decoder that detects ALL QR codes in an image.
 * Supports:
 * - Native BarcodeDetector API (fastest, hardware accelerated, detects multiple codes)
 * - Iterative bounding-box masking with jsQR for multiple QR codes in single canvas
 * - Multiple scales: downscaling large images to ~1024px & 2x upscaling for small images (<500px)
 * - Grayscale and linear contrast stretching
 * - Bradley-Roth local adaptive thresholding (for laminated standee glare & shadows)
 * - 90°, 180°, and 270° rotations
 * - Center-weighted ROI cropping
 * - Inversion attempts ('attemptBoth')
 */
export async function decodeAllQrFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  origWidth: number,
  origHeight: number
): Promise<string[]> {
  const allCodes = new Set<string>();

  // Pass 0: Try native hardware-accelerated BarcodeDetector API first if available
  const nativeResults = await detectAllWithNativeBarcodeDetector(sourceCanvas);
  for (const c of nativeResults) {
    allCodes.add(c);
  }
  if (allCodes.size > 0) {
    return Array.from(allCodes);
  }

  // Pass 1: Try 2x upscaling if image is small (< 500px in either dimension)
  if (origWidth < 500 && origHeight < 500) {
    const upW = origWidth * 2;
    const upH = origHeight * 2;
    const upCanvas = document.createElement('canvas');
    upCanvas.width = upW;
    upCanvas.height = upH;
    const upCtx = upCanvas.getContext('2d', { willReadFrequently: true });
    if (upCtx) {
      upCtx.imageSmoothingEnabled = false; // preserve crisp module edges
      upCtx.drawImage(sourceCanvas, 0, 0, upW, upH);
      const upData = upCtx.getImageData(0, 0, upW, upH);
      const res = decodeAllQrFromImageData(upData.data, upW, upH);
      for (const c of res) allCodes.add(c);
    }
  }

  // Pass 2: Standard inspection at optimal resolution (max 1024px)
  const maxDim = 1024;
  let targetW = origWidth;
  let targetH = origHeight;

  if (origWidth > maxDim || origHeight > maxDim) {
    const scale = Math.min(maxDim / origWidth, maxDim / origHeight);
    targetW = Math.round(origWidth * scale);
    targetH = Math.round(origHeight * scale);
  }

  const workCanvas = document.createElement('canvas');
  workCanvas.width = targetW;
  workCanvas.height = targetH;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!workCtx) return Array.from(allCodes);

  workCtx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
  const baseImgData = workCtx.getImageData(0, 0, targetW, targetH);

  const baseCodes = decodeAllQrFromImageData(baseImgData.data, targetW, targetH);
  for (const c of baseCodes) allCodes.add(c);

  // If no codes found yet, try enhanced passes
  if (allCodes.size === 0) {
    // Pass 3: Grayscale with linear contrast stretching
    const stretchedPixels = applyContrastStretch(baseImgData.data, targetW, targetH);
    const stretchedCodes = decodeAllQrFromImageData(stretchedPixels, targetW, targetH);
    for (const c of stretchedCodes) allCodes.add(c);
  }

  if (allCodes.size === 0) {
    // Pass 4: Bradley-Roth Local Adaptive Thresholding (counters reflections & standee glare)
    const adaptivePixels = applyAdaptiveThreshold(baseImgData.data, targetW, targetH);
    const adaptiveCodes = decodeAllQrFromImageData(adaptivePixels, targetW, targetH);
    for (const c of adaptiveCodes) allCodes.add(c);
  }

  if (allCodes.size === 0) {
    // Pass 5: Center-weighted crop (65% ROI - users naturally center counter standees)
    const cropW = Math.round(targetW * 0.65);
    const cropH = Math.round(targetH * 0.65);
    const cropX = Math.round((targetW - cropW) / 2);
    const cropY = Math.round((targetH - cropH) / 2);

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
    if (cropCtx) {
      cropCtx.drawImage(workCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const cropData = cropCtx.getImageData(0, 0, cropW, cropH);
      const cropCodes = decodeAllQrFromImageData(cropData.data, cropW, cropH);
      for (const c of cropCodes) allCodes.add(c);

      if (allCodes.size === 0) {
        // Also try adaptive threshold on center crop
        const cropAdaptive = applyAdaptiveThreshold(cropData.data, cropW, cropH);
        const cropAdaptiveCodes = decodeAllQrFromImageData(cropAdaptive, cropW, cropH);
        for (const c of cropAdaptiveCodes) allCodes.add(c);
      }
    }
  }

  // Pass 6: Lower-scale fallback (~600px - cleans high-frequency textured print noise)
  if (allCodes.size === 0 && (targetW > 600 || targetH > 600)) {
    const scaleSmall = Math.min(600 / origWidth, 600 / origHeight);
    const smallW = Math.round(origWidth * scaleSmall);
    const smallH = Math.round(origHeight * scaleSmall);

    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = smallW;
    smallCanvas.height = smallH;
    const smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true });
    if (smallCtx) {
      smallCtx.drawImage(sourceCanvas, 0, 0, smallW, smallH);
      const smallData = smallCtx.getImageData(0, 0, smallW, smallH);
      const smallCodes = decodeAllQrFromImageData(smallData.data, smallW, smallH);
      for (const c of smallCodes) allCodes.add(c);
    }
  }

  // Pass 7: Rotations (90°, 180°, 270°) to recover sideways or upside-down photos
  if (allCodes.size === 0) {
    for (const deg of [90, 180, 270] as const) {
      const rotated = createRotatedCanvas(workCanvas, deg);
      const rotCtx = rotated.getContext('2d', { willReadFrequently: true });
      if (rotCtx) {
        const rotData = rotCtx.getImageData(0, 0, rotated.width, rotated.height);
        const rotCodes = decodeAllQrFromImageData(rotData.data, rotated.width, rotated.height);
        for (const c of rotCodes) allCodes.add(c);

        if (allCodes.size === 0) {
          const rotAdaptive = applyAdaptiveThreshold(rotData.data, rotated.width, rotated.height);
          const rotAdaptiveCodes = decodeAllQrFromImageData(rotAdaptive, rotated.width, rotated.height);
          for (const c of rotAdaptiveCodes) allCodes.add(c);
        }
        if (allCodes.size > 0) break;
      }
    }
  }

  return Array.from(allCodes);
}

/**
 * Decodes single QR code from canvas.
 */
export async function decodeQrFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  origWidth: number,
  origHeight: number
): Promise<string | null> {
  const codes = await decodeAllQrFromCanvas(sourceCanvas, origWidth, origHeight);
  return codes.length > 0 ? (codes[0] ?? null) : null;
}

/**
 * Decodes ALL distinct QR codes from an image File/Blob.
 * Never silently drops multiple QR codes.
 */
export function decodeAllQrFromFile(file: Blob): Promise<string[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve([]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        // 1. Try native BarcodeDetector directly on the HTMLImageElement
        const nativeResults = await detectAllWithNativeBarcodeDetector(img);
        if (nativeResults.length > 0) {
          resolve(nativeResults);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve([]);
          return;
        }

        ctx.drawImage(img, 0, 0, img.width, img.height);
        const qrs = await decodeAllQrFromCanvas(canvas, img.width, img.height);
        resolve(qrs);
      };
      img.onerror = () => resolve([]);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve([]);
    reader.readAsDataURL(file);
  });
}

/**
 * Decodes a single QR code from an image File/Blob.
 */
export async function decodeQrFromFile(file: Blob): Promise<string | null> {
  const codes = await decodeAllQrFromFile(file);
  return codes.length > 0 ? (codes[0] ?? null) : null;
}
