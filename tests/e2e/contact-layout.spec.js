import { test, expect } from '@playwright/test';

const email = 'gerencia@inversionesformar.com';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('https://formar-biolink-admin-api.agonzalezpastena7.workers.dev/**', route => route.abort());
  await page.route('https://alexmgp7.github.io/formar-biolink/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/formar-biolink/', '/');
    await route.fulfill({ response: await page.request.get(path) });
  });
});

async function metrics(page) {
  return page.locator('.contact-email-value').evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const rect = element.getBoundingClientRect();
    return {
      lines: range.getClientRects().length,
      fits: element.scrollWidth <= element.clientWidth + 1,
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      visible: rect.left >= 0 && rect.right <= innerWidth + 1,
      pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
    };
  });
}

test('the actual email stays complete on one line at mobile and desktop widths', async ({ page }) => {
  const config = await (await page.request.get('/site-config.json')).json();
  config.contact.email = email;
  await page.route('**/site-config.json?*', route => route.fulfill({ json: config }));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await expect(page.locator('.contact-email-value')).toHaveText(email);
  for (const width of [320, 360, 390, 412, 540, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const value = await metrics(page);
      return value.lines === 1 && value.fits && value.visible && value.pageFits && value.fontSize >= 12;
    }, { message: `Email must fit at ${width}px without clipping or tiny text` }).toBe(true);
  }
});

test('longer email addresses and increased zoom remain readable without clipping', async ({ page }) => {
  const config = await (await page.request.get('/site-config.json')).json();
  const longEmail = 'departamento-de-servicios-y-cotizaciones@inversionesformar.com';
  config.contact.email = longEmail;
  await page.route('**/site-config.json?*', route => route.fulfill({ json: config }));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await expect(page.locator('.contact-email-value')).toHaveText(longEmail);
  await expect.poll(async () => {
    const value = await metrics(page);
    return value.fits && value.visible && value.pageFits && value.fontSize >= 12;
  }).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect.poll(() => metrics(page)).toMatchObject({ fits: true, visible: true });
  expect((await metrics(page)).fontSize).toBeGreaterThanOrEqual(12);
});

test('email size can be changed from the panel and carried into the public configuration', async ({ page }) => {
  await page.goto('/admin.html?demo=1');
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#loadingView')).toBeHidden();
  if (await page.getByRole('button', { name: 'Abrir navegación' }).isVisible()) await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await page.locator('.nav-button[data-view="contacto"]').click();
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  const size = page.getByLabel('Tamaño del correo', { exact: true });
  await size.focus(); await size.press('End'); await size.press('ArrowLeft'); await size.press('ArrowLeft');
  await expect(size).toHaveValue('18');
  await expect(page.locator('#emailTextSizeValue')).toHaveText('18 px');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  const preview = page.frameLocator('#previewFrame').locator('.contact-email-value');
  await expect(preview).toHaveText(email);
  await expect.poll(() => preview.evaluate(element => element.style.getPropertyValue('--email-font-size'))).toBe('18px');
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('formar-admin-preview')));
  expect(draft.appearance.emailFontSize).toBe(18);
  await page.getByRole('button', { name: 'Cerrar vista previa', exact: true }).click();
  await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
  await expect(page.locator('#saveBar')).not.toHaveClass(/show/);
  await page.route('**/site-config.json?*', route => route.fulfill({ json: draft }));
  await page.goto('/');
  await expect(page.locator('.contact-email-value')).toHaveText(email);
  await expect.poll(() => page.locator('.contact-email-value').evaluate(element => element.style.getPropertyValue('--email-font-size'))).toBe('18px');
});
