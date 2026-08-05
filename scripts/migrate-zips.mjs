import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = process.cwd();
const configPath = join(root, 'site-config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

function slug(value) {
  return String(value || 'obra').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'obra';
}

function titleFor(work, entry, index) {
  if (work.photoTitles?.[index]) return work.photoTitles[index];
  const upper = entry.toUpperCase();
  for (const [key, value] of Object.entries(work.photoMap || {})) if (upper.includes(key.toUpperCase())) return value;
  return basename(entry).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || `${work.label} · Foto ${index + 1}`;
}

async function archiveImages(file) {
  const archive = join(root, 'servicios', file);
  if (!existsSync(archive)) throw new Error(`No existe ${archive}`);
  const { stdout } = await exec('unzip', ['-Z1', archive]);
  return stdout.split('\n').filter((entry) => entry && imageExtensions.has(entry.split('.').pop().toLowerCase())).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

let migrated = 0;
let imagesCopied = 0;
for (const category of config.portfolio || []) {
  for (const work of category.works || []) {
    if (!work.file) continue;
    const entries = await archiveImages(work.file);
    const workId = `${slug(category.id || category.name)}-${slug(work.label)}`;
    const targetDir = join(root, 'servicios', 'portfolio', category.id, workId);
    await mkdir(targetDir, { recursive: true });
    const images = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const extension = entry.split('.').pop().toLowerCase();
      const source = join(root, 'servicios', work.file);
      const filename = `${String(index + 1).padStart(2, '0')}-${slug(basename(entry, `.${entry.split('.').pop()}`))}.${extension}`;
      const target = join(targetDir, filename);
      const relative = `servicios/portfolio/${category.id}/${workId}/${filename}`;
      const imageTitle = titleFor(work, entry, index);
      const extracted = await exec('unzip', ['-p', source, entry], { encoding: 'buffer', maxBuffer: 40 * 1024 * 1024 });
      await writeFile(target, extracted.stdout);
      images.push({ id: `${workId}-${index + 1}`, src: relative, title: imageTitle, alt: imageTitle, order: index });
      imagesCopied += 1;
    }
    work.id = workId;
    work.images = images;
    delete work.file;
    delete work.photoTitles;
    delete work.photoMap;
    migrated += 1;
  }
}

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Migrated ${migrated} works and ${imagesCopied} images from ZIP archives.`);
