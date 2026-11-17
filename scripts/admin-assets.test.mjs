import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const declarations = [...script.matchAll(/^      (?:async )?function (\w+)\(/gm)];
const names = new Set([
  'directImages', 'queueAssetRemoval', 'removeImage', 'findWork', 'findImage',
  'handleFiles', 'handleLogoFile', 'useOfficialLogo', 'deleteWork', 'deleteCategory',
  'cleanConfig', 'publish', 'renderCategory',
]);
const functions = declarations.flatMap((match, index) => names.has(match[1])
  ? [script.slice(match.index, declarations[index + 1]?.index)] : []).join('\n');

function editor() {
  const work = { id: 'work', label: 'Obra', images: [] };
  const state = {
    content: { company: { name: 'Formar', logo: { src: 'logo.png' } }, portfolio: [{ name: 'Categoría', works: [work] }] },
    pendingUploads: new Map(), pendingDeletes: new Set(), baseSha: 'original',
  };
  const errors = [];
  let serial = 0;
  let payload;
  const noop = () => {};
  const node = () => ({
    dataset: {}, listeners: new Map(), classList: { add: noop, remove: noop },
    addEventListener(type, callback) { this.listeners.set(type, callback); },
    appendChild: noop, append: noop,
  });
  const context = vm.createContext({
    state, isDemo: false, Date: { now: () => ++serial },
    id: () => `image-${++serial}`, slug: () => 'obra',
    getCategories: () => state.content.portfolio,
    getWorks: (category) => category.works,
    isEditableBrandPath: (path) => path.startsWith('assets/branding/'),
    compressImage: async () => new Blob(['photo']),
    URL: { createObjectURL: () => `blob:photo-${++serial}` },
    confirm: () => true, renderPortfolio: noop, renderStats: noop,
    renderLogoEditor: noop, markDirty: noop, setLoading: noop,
    toast: (message, type) => { if (type === 'error') errors.push(message); },
    $: node, document: { createElement: node }, esc: String,
    fileToBase64: async () => 'cGhvdG8=', loadContent: noop,
    api: async (path, options) => {
      assert.equal(path, '/admin/publish');
      payload = JSON.parse(options.body);
      return { commitSha: 'saved' };
    },
  });
  vm.runInContext(functions, context);
  return { state, work, context, errors, payload: () => payload };
}

const photo = { type: 'image/jpeg', name: 'foto.jpg' };
const savedPhoto = () => ({ id: 'saved', src: 'servicios/portfolio/saved.jpg', path: 'servicios/portfolio/saved.jpg' });

test('adding then removing a photo publishes no upload or deletion', async () => {
  const e = editor();
  await e.context.handleFiles('work', [photo]);
  assert.equal(e.work.images.length, 1);
  e.context.removeImage(e.work, e.work.images[0], 0);
  await e.context.publish();
  assert.deepEqual(e.payload().files, []);
  assert.deepEqual(e.payload().deletePaths, []);
  assert.deepEqual(e.errors, []);
});

test('replacing a photo twice only deletes the original published file', async () => {
  const e = editor();
  e.work.images.push(savedPhoto());
  await e.context.handleFiles('work', [photo], 'saved');
  await e.context.handleFiles('work', [photo], e.work.images[0].id);
  await e.context.publish();
  const payload = e.payload();
  assert.deepEqual(payload.deletePaths, ['servicios/portfolio/saved.jpg']);
  assert.equal(payload.files.length, 1);
  assert.equal(payload.config.portfolio[0].works[0].images[0].src, payload.files[0].path);
  assert.deepEqual(e.errors, []);
});

for (const action of ['deleteWork', 'deleteCategory']) {
  test(`${action} only queues published photos for deletion`, async () => {
    const e = editor();
    e.work.images.push(savedPhoto());
    await e.context.handleFiles('work', [photo]);
    e.context[action](0, 0);
    await e.context.publish();
    assert.deepEqual(e.payload().deletePaths, ['servicios/portfolio/saved.jpg']);
    assert.deepEqual(e.payload().files, []);
    assert.deepEqual(e.errors, []);
  });
}

test('changing a custom logo twice only deletes the original published logo', async () => {
  const e = editor();
  e.state.content.company.logo = { src: 'assets/branding/original.png' };
  await e.context.handleLogoFile(photo);
  await e.context.handleLogoFile(photo);
  await e.context.publish();
  assert.deepEqual(e.payload().deletePaths, ['assets/branding/original.png']);
  assert.equal(e.payload().files.length, 1);
  assert.equal(e.payload().config.company.logo.src, e.payload().files[0].path);
  assert.deepEqual(e.errors, []);
});

test('returning to the official logo discards unpublished uploads', async () => {
  const e = editor();
  await e.context.handleLogoFile(photo);
  e.context.useOfficialLogo();
  await e.context.publish();
  assert.deepEqual(e.payload().deletePaths, []);
  assert.deepEqual(e.payload().files, []);
  assert.equal(e.payload().config.company.logo.src, 'logo.png');
  assert.deepEqual(e.errors, []);
});

for (const value of ['', '-1', '999', 'invalid', '0.5']) {
  test(`dropping a file or invalid category index ${JSON.stringify(value)} preserves category order`, () => {
    const e = editor();
    const first = { name: 'Primera', works: [] }, second = { name: 'Segunda', works: [] };
    e.state.content.portfolio = [first, second];
    const category = e.context.renderCategory(second, 1, '');
    category.listeners.get('drop')({ preventDefault() {}, dataTransfer: { getData: () => value } });
    assert.deepEqual(e.state.content.portfolio, [first, second]);
  });
}

test('dragging a category still changes its order', () => {
  const e = editor();
  const first = { name: 'Primera', works: [] }, second = { name: 'Segunda', works: [] };
  e.state.content.portfolio = [first, second];
  const category = e.context.renderCategory(second, 1, '');
  category.listeners.get('drop')({ preventDefault() {}, dataTransfer: { getData: () => '0' } });
  assert.deepEqual(e.state.content.portfolio, [second, first]);
});
