// Draws the extension's toolbar icons (the JustLink mark: a chain link on an indigo-to-pink
// tile) as PNGs in static/icons. Run it again only to change the icon: `pnpm --filter extension icons`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "static", "icons");
mkdirSync(out, { recursive: true });

// The tile's gradient, top-left to bottom-right: indigo, violet, fuchsia.
const STOPS = [
  [0, [99, 102, 241]],
  [0.55, [139, 92, 246]],
  [1, [217, 70, 239]],
];

function gradient(t) {
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return STOPS.at(-1)[1];
}

/** Signed distance to a rounded square filling the unit box. */
function tile(x, y, radius) {
  const qx = Math.abs(x - 0.5) - (0.5 - radius);
  const qy = Math.abs(y - 0.5) - (0.5 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance to the segment from (ax, ay) to (bx, by). */
function segment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Two stadium-shaped rings along the diagonal: a chain link. Returns coverage 0..1 of the stroke. */
function link(x, y, stroke) {
  const u = Math.SQRT1_2;
  const half = 0.095; // half the straight part of each ring
  const radius = 0.13;
  const rings = [
    [0.395, 0.605],
    [0.605, 0.395],
  ];
  let d = Infinity;
  for (const [cx, cy] of rings) {
    const ring = Math.abs(segment(x, y, cx - half * u, cy + half * u, cx + half * u, cy - half * u) - radius) - stroke / 2;
    d = Math.min(d, ring);
  }
  return d;
}

function render(size) {
  const samples = 4; // 4×4 supersampling for smooth edges
  const rgba = Buffer.alloc(size * size * 4);
  const stroke = size <= 16 ? 0.11 : size <= 32 ? 0.09 : 0.075;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (tile(x, y, 0.23) > 0) continue;
          const [cr, cg, cb] = link(x, y, stroke) <= 0 ? [255, 255, 255] : gradient((x + y) / 2);
          r += cr; g += cg; b += cb; a += 255;
        }
      }
      const n = samples * samples;
      const i = (py * size + px) * 4;
      const coverage = a / 255;
      rgba[i] = coverage ? Math.round(r / coverage) : 0;
      rgba[i + 1] = coverage ? Math.round(g / coverage) : 0;
      rgba[i + 2] = coverage ? Math.round(b / coverage) : 0;
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

// ─── A minimal PNG encoder (RGBA, 8 bits per channel) ───

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // no filter
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(out, `icon-${size}.png`), png(size, render(size)));
}
console.log(`Wrote icons to ${out}`);
