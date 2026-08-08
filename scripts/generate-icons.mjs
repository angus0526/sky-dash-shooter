import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const shipPath = path.join(root, 'public/assets/images/ship.png');
const outDir = path.join(root, 'public/icons');

mkdirSync(outDir, { recursive: true });

const BG = '#0b0f1a';

async function makeIcon(size, shipScale, filename) {
  const shipSize = Math.round(size * shipScale);
  const ship = await sharp(shipPath)
    .rotate(90)
    .resize(shipSize, shipSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG }
  })
    .composite([{ input: ship, gravity: 'center' }])
    .png()
    .toFile(path.join(outDir, filename));

  console.log('wrote', filename);
}

await makeIcon(192, 0.72, 'icon-192.png');
await makeIcon(512, 0.72, 'icon-512.png');
// Maskable icons need extra safe-zone padding since OSes crop to a circle/squircle.
await makeIcon(512, 0.5, 'icon-maskable-512.png');
