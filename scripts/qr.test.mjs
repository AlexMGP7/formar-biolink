import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

test('the downloadable QR opens the public page and matches the panel link', async () => {
  const publicHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const adminHtml = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
  const getUrl = html => html.match(/<meta name="public-url" content="([^"]+)"/)[1];
  const url = getUrl(publicHtml);
  assert.equal(url, 'https://inversionesformar.netlify.app/');
  assert.equal(getUrl(adminHtml), url);
  const png = PNG.sync.read(await readFile(new URL('../assets/qr/formar.png', import.meta.url)));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(decoded, 'QR image can be scanned');
  assert.equal(decoded.data, url);
  assert.equal(png.width, 1024);
  assert.equal(png.height, 1024);
});
