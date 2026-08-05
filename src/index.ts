export interface Env {
  GITHUB_TOKEN: string;
  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  ALLOWED_ORIGIN: string;
}

const SESSION_COOKIE = 'formar_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_COUNT = 24;
const ALLOWED_IMAGE_EXTENSIONS = new Set(['webp', 'jpg', 'jpeg', 'png', 'gif']);

type GitHubJson = Record<string, unknown>;

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function corsHeaders(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  const allowed = origin && origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

function withCors(response: Response, request: Request, env: Env) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

function base64UrlEncode(value: ArrayBuffer | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return new Uint8Array([...binary].map((char) => char.charCodeAt(0)));
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64UrlEncode(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function timingSafeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a[index] ^ b[index];
  return result === 0;
}

async function createSession(env: Env) {
  const payload = base64UrlEncode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }));
  return `${payload}.${await hmac(payload, env.SESSION_SECRET)}`;
}

async function hasValidSession(request: Request, env: Env) {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return false;
  const [payload, signature] = match[1].split('.');
  if (!payload || !signature || !(await timingSafeEqual(signature, await hmac(payload, env.SESSION_SECRET)))) return false;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as { exp?: number };
    return typeof decoded.exp === 'number' && decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function sessionCookie(value: string, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=None`;
}

function githubHeaders(env: Env) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'formar-biolink-admin-api',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function githubRequest(path: string, env: Env, init: RequestInit = {}) {
  const headers = new Headers(githubHeaders(env));
  Object.entries(init.headers || {}).forEach(([key, value]) => headers.set(key, String(value)));
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers });
  const rawBody = await response.text();
  const body = JSON.parse(rawBody || '{}') as GitHubJson;
  if (!response.ok) {
    const message = typeof body.message === 'string' ? body.message : rawBody.slice(0, 180);
    throw new Error(`GitHub API error ${response.status}${message ? `: ${message}` : ''}`);
  }
  return body as GitHubJson;
}

function decodeGitHubContent(encoded: string) {
  const cleaned = encoded.replace(/\n/g, '');
  const binary = atob(cleaned);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function repoPath(env: Env) {
  return `/repos/${env.GITHUB_REPO}`;
}

function hasAllowedImageExtension(value: string) {
  const extension = value.split('.').pop()?.toLowerCase() || '';
  return ALLOWED_IMAGE_EXTENSIONS.has(extension);
}

function isValidEditableImagePath(value: unknown) {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('servicios/portfolio/') && !value.startsWith('assets/branding/')) return false;
  if (value.includes('..') || value.includes('\\') || value.startsWith('/')) return false;
  return hasAllowedImageExtension(value);
}

function isValidConfiguredLogoPath(value: unknown) {
  return value === 'logo.png' || (typeof value === 'string' && value.startsWith('assets/branding/') && isValidEditableImagePath(value));
}

function validateConfig(config: unknown) {
  if (!config || typeof config !== 'object') throw new Error('La configuración no es válida.');
  const company = (config as { company?: unknown }).company;
  if (company && typeof company === 'object') {
    const logo = (company as { logo?: unknown }).logo;
    if (logo !== undefined) {
      if (!logo || typeof logo !== 'object') throw new Error('El logo de la empresa no es válido.');
      if (!isValidConfiguredLogoPath((logo as { src?: unknown }).src)) throw new Error('El logo apunta a una ruta inválida.');
    }
  }
  const portfolio = (config as { portfolio?: unknown }).portfolio;
  if (!Array.isArray(portfolio)) throw new Error('El portafolio no es válido.');
  if (portfolio.length > 100) throw new Error('Hay demasiadas categorías.');
  portfolio.forEach((category) => {
    if (!category || typeof category !== 'object') throw new Error('Hay una categoría inválida.');
    const works = (category as { works?: unknown }).works;
    if (!Array.isArray(works)) throw new Error('Una categoría no tiene obras válidas.');
    works.forEach((work) => {
      if (!work || typeof work !== 'object') throw new Error('Hay una obra inválida.');
      const images = (work as { images?: unknown }).images;
      if (images !== undefined && !Array.isArray(images)) throw new Error('Las imágenes de una obra no son válidas.');
      images?.forEach((image) => {
        if (!image || typeof image !== 'object') throw new Error('Hay una imagen inválida.');
        if (!isValidEditableImagePath((image as { src?: unknown }).src)) throw new Error('Una imagen apunta a una ruta inválida.');
      });
    });
  });
}

async function getContent(env: Env) {
  const path = `${repoPath(env)}/contents/site-config.json?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
  const file = await githubRequest(path, env) as { content?: string; sha?: string };
  if (!file.content || !file.sha) throw new Error('No se pudo leer site-config.json.');
  return { config: JSON.parse(decodeGitHubContent(file.content)), sha: file.sha };
}

async function login(request: Request, env: Env) {
  const body = await request.json().catch(() => null) as { password?: string } | null;
  if (!body?.password || !env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) return json({ error: 'Credenciales no configuradas.' }, 503);
  const matches = await timingSafeEqual(await sha256Hex(body.password), env.ADMIN_PASSWORD_HASH.trim().toLowerCase());
  if (!matches) return json({ error: 'Contraseña incorrecta.' }, 401);
  const session = await createSession(env);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(session) });
}

async function publish(request: Request, env: Env) {
  const body = await request.json().catch(() => null) as {
    config?: unknown;
    baseSha?: string;
    files?: Array<{ path?: string; contentBase64?: string; bytes?: number }>;
    deletePaths?: string[];
  } | null;
  if (!body?.config || !body.baseSha) return json({ error: 'Faltan datos de publicación.' }, 422);
  validateConfig(body.config);
  const files = Array.isArray(body.files) ? body.files : [];
  const deletePaths = Array.isArray(body.deletePaths) ? body.deletePaths : [];
  if (files.length > MAX_IMAGE_COUNT) return json({ error: 'Demasiadas imágenes en una publicación.' }, 413);
  if (deletePaths.some((path) => !isValidEditableImagePath(path))) return json({ error: 'Hay una ruta de eliminación inválida.' }, 422);
  for (const file of files) {
    if (!isValidEditableImagePath(file.path) || typeof file.contentBase64 !== 'string') return json({ error: 'Hay un archivo inválido.' }, 422);
    const bytes = Number(file.bytes || 0);
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_IMAGE_BYTES) return json({ error: 'Una imagen supera el límite permitido.' }, 413);
  }

  const currentContent = await getContent(env);
  if (currentContent.sha !== body.baseSha) return json({ error: 'El contenido cambió mientras editabas. Recarga antes de publicar.' }, 409);

  const ref = await githubRequest(`${repoPath(env)}/git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, env) as { object?: { sha?: string } };
  const currentSha = ref.object?.sha;
  if (!currentSha) return json({ error: 'No se pudo leer la rama de publicación.' }, 502);
  const commit = await githubRequest(`${repoPath(env)}/git/commits/${currentSha}`, env) as { tree?: { sha?: string } };
  if (!commit.tree?.sha) return json({ error: 'No se pudo preparar la publicación.' }, 502);

  const configContent = JSON.stringify(body.config, null, 2) + '\n';
  const configBlob = await githubRequest(`${repoPath(env)}/git/blobs`, env, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: encodeBase64(configContent), encoding: 'base64' }),
  }) as { sha?: string };
  if (!configBlob.sha) throw new Error('No se pudo guardar la configuración.');

  const treeEntries: Array<Record<string, unknown>> = [
    { path: 'site-config.json', mode: '100644', type: 'blob', sha: configBlob.sha },
    ...deletePaths.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
  ];
  for (const file of files) {
    const blob = await githubRequest(`${repoPath(env)}/git/blobs`, env, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: file.contentBase64, encoding: 'base64' }),
    }) as { sha?: string };
    if (!blob.sha) throw new Error(`No se pudo guardar ${file.path}.`);
    treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await githubRequest(`${repoPath(env)}/git/trees`, env, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: treeEntries }),
  }) as { sha?: string };
  if (!tree.sha) throw new Error('No se pudo crear el árbol de publicación.');
  const createdCommit = await githubRequest(`${repoPath(env)}/git/commits`, env, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'chore: actualizar contenido desde el panel admin', tree: tree.sha, parents: [currentSha] }),
  }) as { sha?: string };
  if (!createdCommit.sha) throw new Error('No se pudo crear el commit.');
  try {
    await githubRequest(`${repoPath(env)}/git/refs/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, env, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: createdCommit.sha, force: false }),
    });
  } catch (error) {
    return json({ error: 'GitHub cambió durante la publicación. Vuelve a cargar el contenido.' }, 409);
  }
  return json({ ok: true, commitSha: createdCommit.sha });
}

async function handle(request: Request, env: Env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  const url = new URL(request.url);
  if (url.pathname === '/health') return json({ ok: true, service: 'formar-biolink-admin-api' });
  if (url.pathname === '/auth/login' && request.method === 'POST') return login(request, env);
  if (url.pathname === '/auth/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  if (url.pathname === '/admin/content' && request.method === 'GET') {
    if (!(await hasValidSession(request, env))) return json({ error: 'Sesión expirada.' }, 401);
    return json(await getContent(env));
  }
  if (url.pathname === '/admin/publish' && request.method === 'POST') {
    if (!(await hasValidSession(request, env))) return json({ error: 'Sesión expirada.' }, 401);
    return publish(request, env);
  }
  return json({ error: 'Ruta no encontrada.' }, 404);
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      return withCors(await handle(request, env), request, env);
    } catch (error) {
      console.error(error);
      return withCors(json({ error: error instanceof Error ? error.message : 'Error interno.' }, 500), request, env);
    }
  },
};
