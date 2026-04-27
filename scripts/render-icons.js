import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('icons/source.svg');

for (const size of [16, 48, 128]) {
  await sharp(svg).resize(size, size).png().toFile(`icons/icon${size}.png`);
  console.log(`wrote icons/icon${size}.png`);
}
