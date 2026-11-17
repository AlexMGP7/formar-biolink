import { readFile, mkdir, writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const url = html.match(/<meta name="public-url" content="([^"]+)"/)[1];
const options = { errorCorrectionLevel: 'M', margin: 4, width: 1024, color: { dark: '#12304eff', light: '#ffffffff' } };
const files = {
  'formar.png': await QRCode.toBuffer(url, options),
  'formar.svg': Buffer.from(await QRCode.toString(url, { ...options, type: 'svg' })),
};
const directory = new URL('../assets/qr/', import.meta.url);
if (!process.argv.includes('--check')) await mkdir(directory, { recursive: true });
for (const [name, bytes] of Object.entries(files)) {
  const destination = new URL(name, directory);
  if (process.argv.includes('--check')) {
    if (!(await readFile(destination)).equals(bytes)) throw new Error(`Regenera el QR: ${name}`);
  } else await writeFile(destination, bytes);
}
console.log(`QR verificado: ${url}`);
