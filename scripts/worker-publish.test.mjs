import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import worker from '../src/index.ts';

const env = { GITHUB_TOKEN: 'test-token', SESSION_SECRET: 'test-secret', GITHUB_REPO: 'test/formar', GITHUB_BRANCH: 'main', ALLOWED_ORIGIN: 'https://example.com' };
const config = { company: { logo: { src: 'logo.png' } }, portfolio: [{ works: [{ images: [{ src: 'servicios/portfolio/kept.png' }] }] }] };
const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const signature = createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');

async function publish(options = {}) {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url), path = parsed.pathname;
    assert.equal(parsed.origin, 'https://api.github.com');
    const entry = { path, search: parsed.search, method: init.method || 'GET', body: init.body && JSON.parse(init.body) };
    requests.push(entry);
    let body;
    if (path.endsWith('/git/ref/heads/main')) body = { object: { sha: 'snapshot-head' } };
    else if (path.endsWith('/contents/site-config.json')) body = { sha: 'config-sha', content: Buffer.from(JSON.stringify(config)).toString('base64') };
    else if (path.endsWith('/git/commits/snapshot-head')) body = { tree: { sha: 'snapshot-tree' } };
    else if (path.endsWith('/git/trees/snapshot-tree')) body = { truncated: !!options.truncated, tree: [{ path: 'servicios/portfolio/kept.png' }, { path: 'servicios/portfolio/deleted.png' }] };
    else if (path.endsWith('/git/blobs')) body = { sha: 'config-blob' };
    else if (path.endsWith('/git/trees')) body = { sha: 'created-tree' };
    else if (path.endsWith('/git/commits')) body = { sha: 'created-commit' };
    else if (path.endsWith('/git/refs/heads/main')) {
      if (options.concurrentChange) return Response.json({ message: 'Update is not a fast forward' }, { status: 422 });
      body = { object: { sha: 'created-commit' } };
    } else throw new Error(`Unexpected GitHub request ${path}`);
    return Response.json(body);
  };
  try {
    const request = new Request('https://example.com/admin/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `formar_admin_session=${payload}.${signature}` },
      body: JSON.stringify({ baseSha: options.stale ? 'old-config' : 'config-sha', config, files: [], deletePaths: ['servicios/portfolio/kept.png', 'servicios/portfolio/deleted.png', 'servicios/portfolio/unpublished.png'] }),
    });
    return { response: await worker.fetch(request, env), requests };
  } finally { globalThis.fetch = originalFetch; }
}

test('publication only deletes existing photos that the new content no longer uses', async () => {
  const { response, requests } = await publish();
  assert.equal(response.status, 200);
  const tree = requests.find(request => request.path.endsWith('/git/trees'));
  assert.deepEqual(tree.body.tree.filter(entry => entry.sha === null).map(entry => entry.path), ['servicios/portfolio/deleted.png']);
  const contentRead = requests.find(request => request.path.endsWith('/contents/site-config.json'));
  assert.equal(new URLSearchParams(contentRead.search).get('ref'), 'snapshot-head');
  assert.deepEqual(requests.find(request => request.path.endsWith('/git/commits') && request.method === 'POST').body.parents, ['snapshot-head']);
});

test('a stale draft cannot start a publication', async () => {
  const { response, requests } = await publish({ stale: true });
  assert.equal(response.status, 409);
  assert.ok(requests.every(request => request.method === 'GET'));
});

test('a concurrent branch change is rejected without forcing an overwrite', async () => {
  const { response, requests } = await publish({ concurrentChange: true });
  assert.equal(response.status, 409);
  const update = requests.find(request => request.method === 'PATCH');
  assert.equal(update.body.force, false);
});

test('an incomplete repository snapshot cannot delete any photos', async () => {
  const { response, requests } = await publish({ truncated: true });
  assert.equal(response.status, 502);
  assert.ok(requests.every(request => request.method === 'GET'));
});
