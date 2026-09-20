const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 1024;
const radius = 220;

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header, data])));
  return Buffer.concat([len, header, data, crc]);
}

function inRoundRect(x, y, s, r) {
  const ix = Math.min(Math.max(x, r), s - 1 - r);
  const iy = Math.min(Math.max(y, r), s - 1 - r);
  if (x >= r && x < s - r) return y >= 0 && y < s;
  if (y >= r && y < s - r) return x >= 0 && x < s;
  const dx = x - ix;
  const dy = y - iy;
  return dx * dx + dy * dy <= r * r;
}

function inLetter(x, y, s) {
  const left = s * 0.32;
  const right = s * 0.7;
  const top = s * 0.26;
  const bottom = s * 0.74;
  const thick = s * 0.11;
  const inStem = x >= left && x <= left + thick && y >= top && y <= bottom;
  const inBase = x >= left && x <= right && y >= bottom - thick && y <= bottom;
  return inStem || inBase;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < SIZE; x++) {
    const i = row + 1 + x * 4;
    if (!inRoundRect(x, y, SIZE, radius)) continue;
    if (inLetter(x, y, SIZE)) {
      raw[i] = 245;
      raw[i + 1] = 245;
      raw[i + 2] = 247;
      raw[i + 3] = 255;
    } else {
      raw[i] = 28;
      raw[i + 1] = 28;
      raw[i + 2] = 30;
      raw[i + 3] = 255;
    }
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(__dirname, "../build/icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log("wrote", out);
