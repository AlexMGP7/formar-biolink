import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('      function applyConfig(cfg) {');
const end = html.indexOf('      async function loadConfig()', start);
assert.ok(start >= 0 && end > start, 'Public configuration renderer is present');
const markup = [...html.matchAll(/<a\b[^>]*class="link-card"[^>]*>([\s\S]*?)<\/a>/g)];
assert.equal(markup.length, 4, 'Four contact cards are present');

function render(contact) {
  const cards = markup.map(([tag, body]) => {
    const text = body.match(/<div class="([^"]+)">([^<>]*)<\/div>\s*$/);
    assert.ok(text, 'Contact card contains a visible subtitle');
    const subtitle = { textContent: text[2] };
    return {
      href: tag.match(/href="([^"]*)"/)[1], subtitle,
      querySelector: (selector) => selector === `.${text[1]}` ? subtitle : null,
      setAttribute(name, value) { this[name] = value; },
      removeAttribute(name) { delete this[name]; },
    };
  });
  const context = vm.createContext({
    document: {
      querySelectorAll: (selector) => selector === '.link-card' ? cards : [],
      querySelector: () => null,
    },
  });
  vm.runInContext(html.slice(start, end), context);
  context.applyConfig({ contact });
  return cards;
}

test('saved email appears as both the visible contact and destination', () => {
  const cards = render({ email: 'gerencia@inversionesformar.com' });
  assert.equal(cards[2].subtitle.textContent, 'gerencia@inversionesformar.com');
  assert.equal(new URL(cards[2].href).searchParams.get('to'), 'gerencia@inversionesformar.com');
});

test('saved social, website and location subtitles replace their original labels', () => {
  const cards = render({
    instagram: { url: 'https://instagram.com/qa', subtitle: '@formar-nuevo' },
    website: { url: 'https://example.com/', subtitle: 'Web actualizada' },
    location: { mapsUrl: 'https://maps.google.com/?q=qa', short: 'Ubicación actualizada' },
  });
  assert.equal(cards[0].subtitle.textContent, '@formar-nuevo');
  assert.equal(cards[0].href, 'https://instagram.com/qa');
  assert.equal(cards[1].subtitle.textContent, 'Web actualizada');
  assert.equal(cards[1].href, 'https://example.com/');
  assert.equal(cards[3].subtitle.textContent, 'Ubicación actualizada');
  assert.equal(cards[3].href, 'https://maps.google.com/?q=qa');
});

test('clearing contact labels and destinations removes the old public values', () => {
  const cards = render({
    instagram: { url: '', subtitle: '' }, website: { url: '', subtitle: '' },
    email: '', location: { mapsUrl: '', short: '' },
  });
  for (const card of cards) {
    assert.equal(card.subtitle.textContent, '');
    assert.equal(card.href, undefined);
    assert.equal(card['aria-disabled'], 'true');
  }
});
