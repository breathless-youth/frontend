// Pomeranian mascot mark ("포메") — the design source for assets/splash-icon*.png.
// SDF silhouette (fluffy head + ears) with transparent eye/nose/mouth cutouts.
// Usage: node scripts/generate-splash-mark.js <outDir>  e.g. node scripts/generate-splash-mark.js assets
// Colors are fixed to design tokens: brand.primary #1b64da (light) / #3182f6 (dark).
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const SIZE = 1024;

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- primitives ----
const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;
// iq isosceles triangle: apex at origin pointing +y, base at y=qy, half-width qx
function sdTriIso(px, py, qx, qy) {
  px = Math.abs(px);
  const dq = qx * qx + qy * qy;
  const k1 = Math.max(0, Math.min(1, (px * qx + py * qy) / dq));
  const ax = px - qx * k1,
    ay = py - qy * k1;
  const k2 = Math.max(0, Math.min(1, px / qx));
  const bx = px - qx * k2,
    by = py - qy;
  const s = -Math.sign(qy);
  const d1 = [ax * ax + ay * ay, s * (px * qy - py * qx)];
  const d2 = [bx * bx + by * by, s * (py - qy)];
  const dx = Math.min(d1[0], d2[0]);
  const dy = Math.min(d1[1], d2[1]);
  return -Math.sqrt(dx) * Math.sign(dy);
}
// ear: rounded isosceles triangle, tip at (tx,ty), pointing away from head center (hx,hy)
function sdEar(px, py, tx, ty, hx, hy, halfW, len, round) {
  const dirx = tx - hx,
    diry = ty - hy;
  const dl = Math.hypot(dirx, diry);
  const ux = dirx / dl,
    uy = diry / dl; // outward
  // local frame: origin at tip, +y toward head (inward)
  const ix = -ux,
    iy = -uy;
  const rx = -iy,
    ry = ix;
  const lx = px - tx,
    ly = py - ty;
  const localX = lx * rx + ly * ry;
  const localY = lx * ix + ly * iy;
  return sdTriIso(localX, localY, halfW, len) - round;
}

const P = {
  headR: 0.26,
  headCX: 0.5,
  headCY: 0.53,
  fluffN: 12,
  fluffR: 0.062,
  fluffDist: 0.245,
  earTipX: 0.155, // horizontal offset of ear tip from center
  earTipY: 0.235, // absolute y of ear tip
  earHalfW: 0.082,
  earLen: 0.17,
  earRound: 0.02,
  earClearDeg: 0, // suppress fluff scallops within this angle of each ear (0 = keep all)
  eyeR: 0.033,
  eyeDX: 0.092,
  eyeCY: 0.5,
  noseR: 0.034,
  noseCY: 0.585,
  mouthR: 0.045, // radius of the two "w" arcs
  mouthT: 0.02, // stroke of mouth arcs
};

function silhouette(px, py) {
  let d = sdCircle(px, py, P.headCX, P.headCY, P.headR);
  // even fluff scallops all around (image coords, y down)
  for (let i = 0; i < P.fluffN; i++) {
    const a = (((i + 0.5) / P.fluffN) * 360 * Math.PI) / 180;
    const cx = P.headCX + P.fluffDist * Math.cos(a);
    const cy = P.headCY + P.fluffDist * Math.sin(a);
    d = Math.min(d, sdCircle(px, py, cx, cy, P.fluffR));
  }
  // ears: small vertical triangles peeking above the fluff (tip up, base buried)
  for (const s of [-1, 1]) {
    const tx = P.headCX + s * P.earTipX;
    const ty = P.earTipY;
    d = Math.min(d, sdEar(px, py, tx, ty, tx, ty + 1, P.earHalfW, P.earLen, P.earRound));
  }
  return d;
}

// stroke of the lower half of a circle (for the "w" mouth), angle-limited
function sdSmileArc(px, py, cx, cy, r, t) {
  const dx = px - cx,
    dy = py - cy;
  if (dy < 0) {
    // above center: distance to arc endpoints (left/right of circle)
    return Math.min(Math.hypot(dx + r, dy), Math.hypot(dx - r, dy)) - t / 2;
  }
  return Math.abs(Math.hypot(dx, dy) - r) - t / 2;
}

function features(px, py) {
  let d = Infinity;
  for (const s of [-1, 1])
    d = Math.min(d, sdCircle(px, py, P.headCX + s * P.eyeDX, P.eyeCY, P.eyeR));
  d = Math.min(d, sdCircle(px, py, P.headCX, P.noseCY, P.noseR));
  // "w" mouth: two small downward arcs meeting under the nose
  for (const s of [-1, 1])
    d = Math.min(
      d,
      sdSmileArc(px, py, P.headCX + s * P.mouthR, P.noseCY + 0.01, P.mouthR, P.mouthT),
    );
  return d;
}

function markPome(px, py) {
  // silhouette minus features (features become transparent holes)
  return Math.max(silhouette(px, py), -features(px, py));
}

function render(sd, hex) {
  const R = parseInt(hex.slice(1, 3), 16),
    G = parseInt(hex.slice(3, 5), 16),
    B = parseInt(hex.slice(5, 7), 16);
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const px = 1 / SIZE;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = sd((x + 0.5) / SIZE, (y + 0.5) / SIZE);
      const a = Math.max(0, Math.min(1, 0.5 - d / (1.5 * px)));
      if (a > 0) {
        const i = (y * SIZE + x) * 4;
        buf[i] = R;
        buf[i + 1] = G;
        buf[i + 2] = B;
        buf[i + 3] = Math.round(a * 255);
      }
    }
  }
  return encodePNG(buf, SIZE, SIZE);
}

const outDir = process.argv[2];
fs.writeFileSync(path.join(outDir, "mark-d-light.png"), render(markPome, "#1b64da"));
fs.writeFileSync(path.join(outDir, "mark-d-dark.png"), render(markPome, "#3182f6"));
console.log("done");
