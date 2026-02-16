// ============================================================
// OOH Image Processor – Sharp-based image compositing
//
// Strategy:
//   1. Use the frame photo as the base layer (no resize needed)
//   2. Calculate bounding box from quad points (or rect placement)
//   3. For quads: perspective-warp creative into the quad shape
//      using inverse bilinear interpolation with bilinear sampling
//   4. Composite the warped creative ON TOP of the frame
//
// The perspective warp maps the entire creative into the quad
// polygon so nothing is cut off AND the skew looks natural.
// Only pixels inside the quad are drawn — no overflow.
// ============================================================

import sharp from "sharp";
import type { PlacementConfig, Point2D } from "./types";

/**
 * Compute the axis-aligned bounding box of 4 quad points.
 */
function quadBoundingBox(pts: [Point2D, Point2D, Point2D, Point2D]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x: Math.round(Math.min(...xs)),
    y: Math.round(Math.min(...ys)),
    width: Math.round(Math.max(...xs) - Math.min(...xs)),
    height: Math.round(Math.max(...ys) - Math.min(...ys)),
  };
}

// ── Perspective warp (inverse bilinear) ─────────────────────
//
// Maps a rectangular creative into an arbitrary quadrilateral.
//
// The quad is described by 4 corners: TL, TR, BR, BL.
// The bilinear surface is:
//   P(u,v) = (1-v)(1-u)·TL + (1-v)u·TR + v(1-u)·BL + v·u·BR
//
// For each output pixel (x,y) inside the bounding box we solve
// the inverse problem to find (u,v), then sample the source
// creative at (u,v) with bilinear filtering.
//
// Result: every pixel of the source creative is visible inside
// the quad. Pixels outside the quad remain transparent.

async function perspectiveWarp(
  creativeBuffer: Buffer,
  localQuad: { tl: Point2D; tr: Point2D; br: Point2D; bl: Point2D },
  pw: number,
  ph: number
): Promise<Buffer> {
  // Use 2× resolution source for high-quality sampling
  const refW = Math.min(pw * 2, 4096);
  const refH = Math.min(ph * 2, 4096);

  const { data: src, info } = await sharp(creativeBuffer)
    .resize(refW, refH, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const srcW = info.width;
  const srcH = info.height;

  // Output buffer – RGBA, transparent
  const out = Buffer.alloc(pw * ph * 4, 0);

  const { tl, tr, br, bl } = localQuad;

  // Bilinear surface coefficients:
  // x = ax + bx·u + cx·v + dx·u·v
  // y = ay + by·u + cy·v + dy·u·v
  const ax = tl.x,
    bx = tr.x - tl.x,
    cx = bl.x - tl.x,
    dx = tl.x - tr.x - bl.x + br.x;
  const ay = tl.y,
    by = tr.y - tl.y,
    cy = bl.y - tl.y,
    dy = tl.y - tr.y - bl.y + br.y;

  // Quadratic coefficient for v (constant across all pixels)
  const Aq = dy * cx - cy * dx;

  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const X = x - ax;
      const Y = y - ay;

      // ── Solve for v ──
      // Aq·v² + Bq·v + Cq = 0
      const Bq = Y * dx - dy * X + by * cx - cy * bx;
      const Cq = -(by * X - Y * bx);

      let v: number;

      if (Math.abs(Aq) < 1e-6) {
        // Linear case (parallelogram)
        if (Math.abs(Bq) < 1e-6) continue;
        v = -Cq / Bq;
      } else {
        const disc = Bq * Bq - 4 * Aq * Cq;
        if (disc < 0) continue;
        const sqrtDisc = Math.sqrt(disc);
        const v1 = (-Bq + sqrtDisc) / (2 * Aq);
        const v2 = (-Bq - sqrtDisc) / (2 * Aq);
        // Pick the root in [0, 1]
        if (v1 >= -0.002 && v1 <= 1.002) v = v1;
        else if (v2 >= -0.002 && v2 <= 1.002) v = v2;
        else continue;
      }

      if (v < -0.002 || v > 1.002) continue;
      v = Math.max(0, Math.min(1, v));

      // ── Solve for u ──
      const denom = bx + dx * v;
      let u: number;
      if (Math.abs(denom) > 1e-6) {
        u = (X - cx * v) / denom;
      } else {
        // Fallback: solve from y-equation
        const denomY = by + dy * v;
        if (Math.abs(denomY) < 1e-6) continue;
        u = (Y - cy * v) / denomY;
      }

      if (u < -0.002 || u > 1.002) continue;
      u = Math.max(0, Math.min(1, u));

      // ── Bilinear sample from source creative ──
      const fx = u * (srcW - 1);
      const fy = v * (srcH - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const dxf = fx - x0;
      const dyf = fy - y0;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;

      const di = (y * pw + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        out[di + ch] = Math.round(
          (1 - dyf) *
            ((1 - dxf) * src[i00 + ch] + dxf * src[i10 + ch]) +
            dyf *
              ((1 - dxf) * src[i01 + ch] + dxf * src[i11 + ch])
        );
      }
    }
  }

  return sharp(out, { raw: { width: pw, height: ph, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * Composite a creative image onto a frame image.
 *
 * The frame is the base layer; the creative is placed ON TOP at the
 * defined placement area. Works with any opaque photo.
 *
 * For quad placements the creative is:
 *  1. Bounding box calculated from the 4 quad points
 *  2. Creative perspective-warped into the quad shape (scanline mapping)
 *  3. Composited on top of the frame — full creative visible with perspective
 *
 * For rect placements the creative is simply stretched to fill.
 */
export async function compositeCreativeOnFrame(
  frameBuffer: Buffer,
  creativeBuffer: Buffer,
  placement: PlacementConfig,
  frameWidth: number,
  frameHeight: number
): Promise<Buffer> {
  // ── Read actual frame dimensions (handles EXIF rotation etc.) ──
  const frameMeta = await sharp(frameBuffer).metadata();
  const actualW = frameMeta.width || frameWidth;
  const actualH = frameMeta.height || frameHeight;

  // Scale factor: placement coords are in (frameWidth × frameHeight) space
  const sx = actualW / frameWidth;
  const sy = actualH / frameHeight;

  // ── Determine placement rectangle ──
  let px: number, py: number, pw: number, ph: number;
  const hasQuad = !!placement.quadPoints;

  if (hasQuad) {
    const bb = quadBoundingBox(placement.quadPoints!);
    px = bb.x;
    py = bb.y;
    pw = bb.width;
    ph = bb.height;
  } else {
    px = placement.x;
    py = placement.y;
    pw = placement.width;
    ph = placement.height;
  }

  // Apply scale to map to actual pixels
  px = Math.round(px * sx);
  py = Math.round(py * sy);
  pw = Math.max(1, Math.round(pw * sx));
  ph = Math.max(1, Math.round(ph * sy));

  let preparedCreative: Buffer;

  if (hasQuad) {
    // ── Perspective warp: map creative into quad shape ──
    // Convert quad points to local coordinates within the bounding box
    const qp = placement.quadPoints!;
    const localQuad = {
      tl: { x: Math.round(qp[0].x * sx) - px, y: Math.round(qp[0].y * sy) - py },
      tr: { x: Math.round(qp[1].x * sx) - px, y: Math.round(qp[1].y * sy) - py },
      br: { x: Math.round(qp[2].x * sx) - px, y: Math.round(qp[2].y * sy) - py },
      bl: { x: Math.round(qp[3].x * sx) - px, y: Math.round(qp[3].y * sy) - py },
    };

    preparedCreative = await perspectiveWarp(creativeBuffer, localQuad, pw, ph);
  } else {
    // ── Simple stretch for rectangular placements ──
    preparedCreative = await sharp(creativeBuffer)
      .resize(pw, ph, { fit: "fill" })
      .ensureAlpha()
      .png()
      .toBuffer();

    // Handle rotation (legacy rect-based)
    if (placement.rotation && placement.rotation !== 0) {
      preparedCreative = await sharp(preparedCreative)
        .rotate(placement.rotation, {
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    }
  }

  // ── Composite: frame as base, creative on top ──
  const result = await sharp(frameBuffer)
    .composite([
      {
        input: preparedCreative,
        left: px,
        top: py,
        blend: "over",
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return result;
}

/**
 * Composite multiple placements onto a single frame image.
 * Each assignment maps a placement to a creative buffer.
 * Placements are composited sequentially (first to last).
 */
export async function compositeMultiplePlacements(
  frameBuffer: Buffer,
  assignments: { placement: PlacementConfig; creativeBuffer: Buffer }[],
  frameWidth: number,
  frameHeight: number
): Promise<Buffer> {
  if (assignments.length === 0) {
    // No assignments — return frame as JPEG
    return sharp(frameBuffer).jpeg({ quality: 92 }).toBuffer();
  }
  if (assignments.length === 1) {
    return compositeCreativeOnFrame(
      frameBuffer,
      assignments[0].creativeBuffer,
      assignments[0].placement,
      frameWidth,
      frameHeight
    );
  }

  // For multiple placements: composite sequentially using PNG for intermediate
  // steps to preserve quality, then encode final as JPEG.
  let current = frameBuffer;
  for (let i = 0; i < assignments.length; i++) {
    const { placement, creativeBuffer } = assignments[i];
    const isLast = i === assignments.length - 1;

    // compositeCreativeOnFrame outputs JPEG — for intermediate steps,
    // we need to keep using the buffer as-is (sharp handles re-reading JPEG)
    current = await compositeCreativeOnFrame(
      current,
      creativeBuffer,
      placement,
      frameWidth,
      frameHeight
    );
  }
  return current;
}

/**
 * Composite using URLs for frame and creative images (fetches them first).
 */
export async function compositeFromUrls(
  frameImageUrl: string,
  creativeImageUrl: string,
  placement: PlacementConfig,
  frameWidth: number,
  frameHeight: number
): Promise<Buffer> {
  const [frameRes, creativeRes] = await Promise.all([
    fetch(frameImageUrl).then((r) => r.arrayBuffer()),
    fetch(creativeImageUrl).then((r) => r.arrayBuffer()),
  ]);

  return compositeCreativeOnFrame(
    Buffer.from(frameRes),
    Buffer.from(creativeRes),
    placement,
    frameWidth,
    frameHeight
  );
}

/**
 * Generate a thumbnail from an image buffer.
 */
export async function generateThumbnail(
  imageBuffer: Buffer,
  maxWidth = 400
): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(maxWidth, undefined, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Get image metadata (dimensions, format).
 */
export async function getImageMetadata(buffer: Buffer) {
  const meta = await sharp(buffer).metadata();
  return {
    width: meta.width || 0,
    height: meta.height || 0,
    format: meta.format || "unknown",
    size: buffer.length,
  };
}
