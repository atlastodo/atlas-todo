#!/usr/bin/env node
/**
 * Generates apps/electron/assets/tray.png (16x16) and tray@2x.png (32x32): the monochrome
 * (white + alpha) globe of apps/mobile/assets/favicon.svg. Plain Node: the PNG is assembled by
 * hand. Re-run: `node scripts/generate-tray-icon.mjs`.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// CRC-32 (PNG's 0xEDB88320 polynomial), table-driven.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * Mathematical test whether a normalized point (x, y) in [-1, 1] intersects the globe lines.
 * Geometry matches apps/mobile/assets/favicon.svg:
 * - Outer circle: radius R
 * - Meridian ellipse: semi-axes rx, ry
 * - Equator line: y = 0 within circle
 */
function isGlobePoint(x, y, R, W, rx, ry) {
  const dCircle = Math.abs(Math.hypot(x, y) - R);
  if (dCircle <= W / 2) return true;

  if (Math.hypot(x, y) <= R + W / 2) {
    // Equator line
    if (Math.abs(y) <= W / 2) return true;

    // Vertical meridian ellipse
    const qx = x / rx;
    const qy = y / ry;
    const val = qx * qx + qy * qy - 1;
    const gradLen = 2 * Math.hypot(x / (rx * rx), y / (ry * ry));
    const dEllipse = Math.abs(val) / gradLen;
    if (dEllipse <= W / 2) return true;
  }
  return false;
}

function generateGlobePng(size) {
  const R = size === 16 ? 0.78 : 0.8;
  const W = size === 16 ? 0.22 : 0.18;
  const rx = 0.46 * R;
  const ry = R;
  const samples = 8;
  const totalSamples = samples * samples;

  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;

  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // Filter byte: None
    for (let x = 0; x < size; x++) {
      let active = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = ((x + (sx + 0.5) / samples) / size) * 2 - 1;
          const py = ((y + (sy + 0.5) / samples) / size) * 2 - 1;
          if (isGlobePoint(px, py, R, W, rx, ry)) {
            active++;
          }
        }
      }
      const alpha = Math.round(255 * (active / totalSamples));
      raw[offset++] = 255; // R
      raw[offset++] = 255; // G
      raw[offset++] = 255; // B
      raw[offset++] = alpha; // A
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "../assets");
mkdirSync(assetsDir, { recursive: true });

const png1x = generateGlobePng(16);
const out1x = join(assetsDir, "tray.png");
writeFileSync(out1x, png1x);
console.log(`Wrote ${out1x} (${png1x.length} bytes, 16x16)`);

const png2x = generateGlobePng(32);
const out2x = join(assetsDir, "tray@2x.png");
writeFileSync(out2x, png2x);
console.log(`Wrote ${out2x} (${png2x.length} bytes, 32x32 HiDPI)`);
