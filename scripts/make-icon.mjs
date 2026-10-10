#!/usr/bin/env node
/**
 * Generates images/icon.png (128x128) without any image dependency: a rounded
 * square with a git-branch mark, antialiased by supersampling.
 *
 *   node scripts/make-icon.mjs
 *
 * Edit the geometry below and re-run to tweak the artwork.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SIZE = 128;
const SAMPLES = 4; // subsamples per axis, per pixel

const MARGIN = 3;
const CORNER_RADIUS = 26;
const GRADIENT_TOP = [76, 141, 255];
const GRADIENT_BOTTOM = [29, 78, 216];

// The branch mark, in 128x128 coordinates.
const STROKE = 10.5;
const NODE_RADIUS = 11;
const TRUNK_X = 44;
const TRUNK_TOP = 31;
const TRUNK_BOTTOM = 97;
const BRANCH_Y = 71;
const BRANCH_X = 84;
const BRANCH_NODE_Y = 31;
const GLYPH = [255, 255, 255];

const NODES = [
  [TRUNK_X, TRUNK_TOP],
  [TRUNK_X, TRUNK_BOTTOM],
  [BRANCH_X, BRANCH_NODE_Y],
];

const SEGMENTS = [
  [TRUNK_X, TRUNK_TOP, TRUNK_X, TRUNK_BOTTOM],
  [TRUNK_X, BRANCH_Y, BRANCH_X, BRANCH_Y],
  [BRANCH_X, BRANCH_Y, BRANCH_X, BRANCH_NODE_Y],
];

function insideRoundedRect(x, y) {
  const half = SIZE / 2;
  const dx = Math.abs(x - half) - (half - MARGIN - CORNER_RADIUS);
  const dy = Math.abs(y - half) - (half - MARGIN - CORNER_RADIUS);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) <= CORNER_RADIUS;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lengthSquared = vx * vx + vy * vy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / lengthSquared));
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
}

function insideGlyph(x, y) {
  for (const [x1, y1, x2, y2] of SEGMENTS) {
    if (distanceToSegment(x, y, x1, y1, x2, y2) <= STROKE) {
      return true;
    }
  }
  return NODES.some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= NODE_RADIUS);
}

function renderPixels() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const samples = SAMPLES * SAMPLES;

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let covered = 0;

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = px + (sx + 0.5) / SAMPLES;
          const y = py + (sy + 0.5) / SAMPLES;

          if (!insideRoundedRect(x, y)) {
            continue;
          }

          if (insideGlyph(x, y)) {
            red += GLYPH[0];
            green += GLYPH[1];
            blue += GLYPH[2];
          } else {
            const t = Math.min(1, Math.max(0, (y - MARGIN) / (SIZE - 2 * MARGIN)));
            red += GRADIENT_TOP[0] + (GRADIENT_BOTTOM[0] - GRADIENT_TOP[0]) * t;
            green += GRADIENT_TOP[1] + (GRADIENT_BOTTOM[1] - GRADIENT_TOP[1]) * t;
            blue += GRADIENT_TOP[2] + (GRADIENT_BOTTOM[2] - GRADIENT_TOP[2]) * t;
          }
          covered++;
        }
      }

      const offset = (py * SIZE + px) * 4;
      if (covered > 0) {
        pixels[offset] = Math.round(red / covered);
        pixels[offset + 1] = Math.round(green / covered);
        pixels[offset + 2] = Math.round(blue / covered);
      }
      pixels[offset + 3] = Math.round((covered / samples) * 255);
    }
  }

  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = SIZE * 4;
  const raw = Buffer.alloc(SIZE * (stride + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(repoRoot, 'images', 'icon.png');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, encodePng(renderPixels()));
console.log(`wrote ${target} (${SIZE}x${SIZE})`);
