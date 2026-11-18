import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const publicUrl = 'https://inversionesformar.netlify.app/';
function scan(bytes) {
  const png = PNG.sync.read(bytes);
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(result?.data).toBe(publicUrl);
}

async function openEditor(page) {
  await page.goto('/admin.html?demo=1');
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#loadingView')).toBeHidden();
}

async function navigate(page, view) {
  if (await page.getByRole('button', { name: 'Abrir navegación' }).isVisible()) await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await page.locator(`.nav-button[data-view="${view}"]`).click();
}

// Espera las descargas redirigidas antes de cerrar el contexto de cada prueba.
// El portafolio puede seguir cargando imágenes después de la última aserción.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

test.beforeEach(async ({ page }) => {
  await page.route('https://formar-biolink-admin-api.agonzalezpastena7.workers.dev/**', route => route.abort());
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('https://alexmgp7.github.io/formar-biolink/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/formar-biolink/', '/');
    await route.fulfill({ response: await page.request.get(path) });
  });
});

test('public QR preview and both downloaded files open the stable public address', async ({ page, browserName }, testInfo) => {
  await page.goto('/?preview=0&campaign=ignored');
  const trigger = page.getByRole('button', { name: 'Mostrar código QR', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Código QR de Formar' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Enlace de la página')).toHaveValue(publicUrl);
  if (browserName === 'chromium') await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await dialog.getByRole('button', { name: 'Copiar enlace' }).click();
  if (browserName === 'chromium') {
    await expect(dialog.getByRole('status')).toHaveText('Enlace copiado.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);
  } else await expect(dialog.getByRole('status')).toHaveText(/Enlace copiado|Selecciona y copia/);
  const image = dialog.locator('img');
  await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  scan(await image.screenshot());
  for (const format of ['png', 'svg']) {
    const event = page.waitForEvent('download');
    await dialog.getByRole('link', { name: format === 'png' ? 'Descargar PNG' : 'SVG para imprenta' }).click();
    const download = await event;
    expect(download.suggestedFilename()).toBe(`QR-Inversiones-Formar.${format}`);
    const path = testInfo.outputPath(`qr.${format}`);
    await download.saveAs(path);
    const bytes = await readFile(path);
    if (format === 'png') scan(bytes);
    else expect(bytes.toString()).toContain('<svg');
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.goto('/assets/qr/formar.svg');
  scan(await page.locator('svg').screenshot());
});

test('QR opens from the editor without changing the draft', async ({ page }) => {
  await openEditor(page);
  await navigate(page, 'empresa');
  await page.getByLabel('Nombre de la empresa', { exact: true }).fill('Borrador sin publicar');
  if (await page.getByRole('button', { name: 'Abrir navegación' }).isVisible()) await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await page.getByRole('button', { name: 'Código QR', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Código QR de Formar' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Enlace de la página')).toHaveValue(publicUrl);
  await dialog.getByRole('button', { name: 'Cerrar código QR' }).click();
  await expect(page.getByLabel('Nombre de la empresa', { exact: true })).toHaveValue('Borrador sin publicar');
  await expect(page.locator('#saveBar')).toHaveClass(/show/);
});

test('visible location and optional contact text can be edited and cleared', async ({ page }) => {
  await openEditor(page);
  await navigate(page, 'contacto');
  const location = page.getByLabel('Ubicación: texto visible en la tarjeta', { exact: true });
  await location.fill('C.C. A.B., Pampatar, Venezuela');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  const preview = page.frameLocator('#previewFrame');
  await expect(preview.locator('.link-card').nth(3).locator('.lc-sub')).toHaveText('C.C. A.B., Pampatar, Venezuela');
  await page.getByRole('button', { name: 'Cerrar vista previa', exact: true }).click();
  for (const input of await page.locator('#view-contacto [data-path^="contact."]').all()) await input.fill('');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(preview.locator('.link-card .lc-sub')).toHaveText(['', '', '', '']);
  for (const link of await preview.locator('.link-card').all()) await expect(link).not.toHaveAttribute('href');
  await expect(preview.locator('.wa-sub')).toHaveText('');
  await expect(preview.locator('.addr-sub')).toHaveText('');
  await page.getByRole('button', { name: 'Cerrar vista previa', exact: true }).click();
  await navigate(page, 'empresa');
  for (const path of ['company.handle', 'company.description', 'company.footer']) await page.locator(`[data-path="${path}"]`).fill('');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(preview.locator('.brand-handle')).toHaveText('');
  await expect(preview.locator('.section-text')).toHaveText('');
  await expect(preview.locator('.footer')).toHaveText('');
});

test('invalid contact fields stay editable and cannot be silently published', async ({ page }) => {
  await openEditor(page);
  await navigate(page, 'contacto');
  const email = page.getByLabel('Correo electrónico', { exact: true });
  await email.fill('no-es-un-correo');
  await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
  await expect(email).toBeFocused();
  await expect(page.locator('#saveBar')).toHaveClass(/show/);
  await email.fill('correo@example.com');
  const website = page.getByLabel('Sitio web: enlace', { exact: true });
  await website.fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
  await expect(website).toBeFocused();
  await website.fill('example.com/');
  await page.getByLabel('WhatsApp: número con código de país', { exact: true }).fill('+58 (414) 123-4567');
  await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
  await expect(website).toHaveValue('https://example.com/');
  await expect(page.locator('#saveBar')).not.toHaveClass(/show/);
});

test('an expired session preserves the edited photo and draft for a new login', async ({ page }) => {
  const original = await (await page.request.get('/site-config.json')).json();
  let current = structuredClone(original), authenticated = false, attempts = 0, published;
  const uploaded = new Map();
  const headers = {
    'access-control-allow-origin': 'http://127.0.0.1:4197',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  await page.route('https://alexmgp7.github.io/formar-biolink/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/formar-biolink/', '');
    if (uploaded.has(path)) await route.fulfill({ contentType: 'image/webp', body: uploaded.get(path) });
    else await route.fallback();
  });
  await page.route('https://formar-biolink-admin-api.agonzalezpastena7.workers.dev/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/auth/login') { authenticated = true; return route.fulfill({ headers, json: { ok: true } }); }
    if (path === '/auth/logout') { authenticated = false; return route.fulfill({ headers, json: { ok: true } }); }
    if (!authenticated) return route.fulfill({ status: 401, headers, json: { error: 'Sesión expirada.' } });
    if (path === '/admin/content') return route.fulfill({ headers, json: { config: current, sha: 'test-base-sha' } });
    if (path === '/admin/publish') {
      attempts += 1;
      if (attempts === 1) { authenticated = false; return route.fulfill({ status: 401, headers, json: { error: 'Sesión expirada.' } }); }
      published = request.postDataJSON(); current = published.config;
      for (const file of published.files) uploaded.set(file.path, Buffer.from(file.contentBase64, 'base64'));
      return route.fulfill({ headers, json: { ok: true, commitSha: 'saved-test-draft' } });
    }
    return route.abort();
  });
  const login = async () => {
    await page.getByLabel('Contraseña de acceso').fill('test-password');
    await page.getByRole('button', { name: 'Entrar al panel' }).click();
    await expect(page.locator('#appShell')).toBeVisible();
    await expect(page.locator('#loadingView')).toBeHidden();
  };
  await page.goto('/admin.html');
  await expect(page.locator('#loadingView')).toBeHidden();
  await login();
  await navigate(page, 'portafolio');
  const work = page.locator('.work-card').first();
  const originalPath = original.portfolio[0].works[0].images[0].src;
  await work.getByLabel('Nombre de la obra', { exact: true }).fill('Borrador conservado tras renovar sesión');
  const fileChooser = page.waitForEvent('filechooser');
  await work.getByRole('button', { name: 'Cambiar imagen', exact: true }).first().click();
  await (await fileChooser).setFiles({
    name: 'foto-sesion.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.locator('#loadingView')).toBeHidden();
  await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#saveBar')).not.toHaveClass(/show/);
  await login();
  await expect(work.getByLabel('Nombre de la obra', { exact: true })).toHaveValue('Borrador conservado tras renovar sesión');
  await expect(work.locator('.image-card img').first()).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
  await expect(page.locator('#saveBar')).not.toHaveClass(/show/);
  expect(published.baseSha).toBe('test-base-sha');
  expect(published.deletePaths).toEqual([originalPath]);
  expect(published.files).toHaveLength(1);
  expect(published.config.portfolio[0].works[0].images[0].src).toBe(published.files[0].path);
});
