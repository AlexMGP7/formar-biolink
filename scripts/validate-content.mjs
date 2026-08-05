import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const config = JSON.parse(await readFile(join(root, 'site-config.json'), 'utf8'));
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const errors = [];
const paths = new Set();

const logoPath = config.company?.logo?.src;
const logoExtension = String(logoPath || '').split('.').pop()?.toLowerCase();
const validBrandPath = typeof logoPath === 'string' && logoPath.startsWith('assets/branding/') && !logoPath.includes('..') && !logoPath.includes('\\') && imageExtensions.has(logoExtension);
if (!logoPath || (logoPath !== 'logo.png' && !validBrandPath)) {
  errors.push(`Ruta de logo inválida: ${logoPath}`);
} else {
  const logoFilePath = join(root, logoPath);
  if (!existsSync(logoFilePath)) errors.push(`Falta archivo de logo: ${logoPath}`);
  else if ((await stat(logoFilePath)).size === 0) errors.push(`Archivo de logo vacío: ${logoPath}`);
}

for (const category of config.portfolio || []) {
  if (!category.id || !category.name || !Array.isArray(category.works)) errors.push(`Categoría inválida: ${category.name || 'sin nombre'}`);
  for (const work of category.works || []) {
    if (!work.id || !work.label || !Array.isArray(work.images)) errors.push(`Obra inválida: ${work.label || 'sin nombre'}`);
    for (const image of work.images || []) {
      const imagePath = image.src;
      const extension = String(imagePath || '').split('.').pop()?.toLowerCase();
      if (!imagePath || !imagePath.startsWith('servicios/portfolio/') || !imageExtensions.has(extension)) errors.push(`Ruta inválida: ${imagePath}`);
      if (paths.has(imagePath)) errors.push(`Ruta duplicada: ${imagePath}`);
      paths.add(imagePath);
      const filePath = join(root, imagePath || 'missing');
      if (!existsSync(filePath)) errors.push(`Falta archivo: ${imagePath}`);
      else if ((await stat(filePath)).size === 0) errors.push(`Archivo vacío: ${imagePath}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Validated ${paths.size} direct portfolio images.`);
