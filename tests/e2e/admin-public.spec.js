import { test, expect } from '@playwright/test';

const fields = {
  'company.name': 'Formar prueba pública',
  'company.handle': '@formar-prueba',
  'company.description': 'Descripción de empresa actualizada desde el panel.',
  'company.footer': 'Pie de página actualizado',
  'contact.instagram.url': 'https://instagram.com/formar-prueba',
  'contact.instagram.subtitle': '@contacto-nuevo',
  'contact.website.url': 'https://example.com/formar',
  'contact.website.subtitle': 'Sitio web actualizado',
  'contact.email': 'gerencia+prueba@example.com',
  'contact.whatsapp.number': '584140001122',
  'contact.whatsapp.display': '+58 414-0001122',
  'contact.location.short': 'Dirección actualizada en Pampatar',
  'contact.location.mapsUrl': 'https://maps.google.com/?q=Formar',
  'contact.location.full': 'Avenida de prueba\nLocal 23 · Pampatar',
};

async function navigate(page, view) {
  if (await page.locator('#mobileMenu').isVisible()) await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await page.locator(`.nav-button[data-view="${view}"]`).click();
}

async function assertProfile(root) {
  await expect(root.locator('.brand-name')).toHaveText(fields['company.name']);
  await expect(root.locator('.brand-handle')).toHaveText(fields['company.handle']);
  await expect(root.locator('.section-text')).toHaveText(fields['company.description']);
  await expect(root.locator('.footer')).toHaveText(fields['company.footer']);
  const cards = root.locator('.link-card');
  await expect(cards.locator('.lc-sub')).toHaveText([
    fields['contact.instagram.subtitle'], fields['contact.website.subtitle'],
    fields['contact.email'], fields['contact.location.short'],
  ]);
  await expect(cards.nth(0)).toHaveAttribute('href', fields['contact.instagram.url']);
  await expect(cards.nth(1)).toHaveAttribute('href', fields['contact.website.url']);
  await expect(cards.nth(2)).toHaveAttribute('href', `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(fields['contact.email'])}`);
  await expect(cards.nth(3)).toHaveAttribute('href', fields['contact.location.mapsUrl']);
  await expect(root.locator('.wa-btn')).toHaveAttribute('href', `https://wa.me/${fields['contact.whatsapp.number']}`);
  await expect(root.locator('.wa-sub')).toContainText(fields['contact.whatsapp.display']);
  await expect(root.locator('.address-link')).toHaveAttribute('href', fields['contact.location.mapsUrl']);
  await expect(root.locator('.addr-sub')).toHaveText(fields['contact.location.full'], { useInnerText: true });
}

test.beforeEach(async ({ page }) => {
  // Keep these browser tests local and independent of production APIs or assets.
  await page.route('https://formar-biolink-admin-api.agonzalezpastena7.workers.dev/**', route => route.abort());
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('https://alexmgp7.github.io/formar-biolink/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/formar-biolink/', '/');
    const response = await page.request.get(path);
    await route.fulfill({ response });
  });
  await page.goto('/admin.html?demo=1');
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#loadingView')).toBeHidden();
});

test('all 14 editable profile fields reach the preview and a fresh public page', async ({ page }) => {
  await navigate(page, 'empresa');
  for (const [path, value] of Object.entries(fields).filter(([path]) => path.startsWith('company.'))) {
    await page.locator(`[data-path="${path}"]`).fill(value);
  }
  await navigate(page, 'contacto');
  for (const [path, value] of Object.entries(fields).filter(([path]) => path.startsWith('contact.'))) {
    await page.locator(`[data-path="${path}"]`).fill(value);
  }
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await assertProfile(page.frameLocator('#previewFrame'));
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('formar-admin-preview')));
  await page.getByRole('button', { name: 'Cerrar vista previa', exact: true }).click();
  await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
  await expect(page.locator('#saveBar')).not.toHaveClass(/show/);
  await page.route('**/site-config.json?*', route => route.fulfill({ json: draft }));
  await page.goto('/');
  await assertProfile(page);
  await expect(page).toHaveTitle(fields['company.name']);
});

test('edited work details, photo labels and alt text reach the public gallery', async ({ page }) => {
  await navigate(page, 'portafolio');
  const category = page.locator('.category-card').first();
  await category.getByLabel('Nombre de categoría', { exact: true }).fill('Categoría visible QA');
  const work = page.locator('.work-card').first();
  await work.getByLabel('Nombre de la obra', { exact: true }).fill('Obra visible QA');
  await work.locator('.work-description').fill('Descripción visible de esta obra.');
  await work.getByRole('checkbox', { name: 'Mostrar títulos' }).check();
  await work.getByLabel('Título visible de la foto', { exact: true }).first().fill('Foto visible QA');
  await work.getByLabel('Descripción accesible de la foto', { exact: true }).first().fill('Texto alternativo QA');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  const preview = page.frameLocator('#previewFrame');
  await preview.getByText('Categoría visible QA', { exact: true }).click();
  await expect(preview.locator('.subcategory-title').first()).toHaveText('Obra visible QA');
  await expect(preview.locator('.subcategory-description').first()).toHaveText('Descripción visible de esta obra.');
  await expect(preview.locator('.gallery-item-caption').first()).toHaveText('Foto visible QA');
  await expect(preview.locator('.gallery-image').first()).toHaveAttribute('alt', 'Texto alternativo QA');
});

test('a changed logo renders in preview and can return to the official logo', async ({ page }) => {
  await navigate(page, 'empresa');
  await page.locator('#logoFileInput').setInputFiles({
    name: 'logo-prueba.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.locator('#logoFileStatus')).toHaveText('Nuevo logo listo para publicar');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  const logo = page.frameLocator('#previewFrame').locator('#brandLogo');
  await expect(logo).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => logo.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Cerrar vista previa', exact: true }).click();
  await page.getByRole('button', { name: 'Usar logo oficial', exact: true }).click();
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(logo).toHaveAttribute('src', /\/logo\.png$/);
  await expect.poll(() => logo.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
});
