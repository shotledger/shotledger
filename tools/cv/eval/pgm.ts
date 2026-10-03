import { readFileSync } from 'node:fs';

/** Binary greyscale PGM (P5, maxval 255), as ImageMagick and cv2.imwrite write it. */
export function readPgm(path: string) {
  const buf = readFileSync(path);
  let pos = 0;
  const fields: string[] = [];
  while (fields.length < 4) {
    while (/\s/.test(String.fromCharCode(buf[pos]!))) pos += 1;
    if (buf[pos] === 0x23) {
      while (buf[pos] !== 0x0a) pos += 1;
      continue;
    }
    let token = '';
    while (!/\s/.test(String.fromCharCode(buf[pos]!))) token += String.fromCharCode(buf[pos++]!);
    fields.push(token);
  }
  pos += 1; // the single whitespace before the raster
  const [magic, w, h, max] = fields;
  if (magic !== 'P5' || max !== '255') throw new Error(`${path}: not an 8-bit P5 PGM`);
  const width = Number(w);
  const height = Number(h);
  return { width, height, data: new Uint8Array(buf.buffer, buf.byteOffset + pos, width * height) };
}
