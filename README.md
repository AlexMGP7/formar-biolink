# Inversiones Formar Biolink

Sitio público estático con contenido versionado en GitHub y shell final en Netlify:

- Público: https://inversionesformar.netlify.app/
- Panel: https://inversionesformar.netlify.app/admin.html
- Contenido y galerías: `site-config.json` e imágenes directas en `servicios/portfolio/`
- API segura del panel: `https://formar-biolink-admin-api.agonzalezpastena7.workers.dev`

## Flujo de publicación

El panel autentica contra el Worker de Cloudflare. Al pulsar `Publicar cambios`, el Worker valida el contenido y crea un commit en `AlexMGP7/formar-biolink`. GitHub Pages sirve el JSON y las imágenes; el workflow de Netlify publica el shell HTML/CSS/JS sin consumir un despliegue manual desde el equipo.

Las imágenes se suben desde el panel por toque, selección de archivos o arrastre. El navegador las convierte a WebP antes de publicarlas y guarda título, texto alternativo y orden.

## Desarrollo local

```bash
npm install
npm run content:check
npm run worker:typecheck
npm run worker:check
python3 -m http.server 4173
```

Para revisar el panel sin iniciar sesión: `http://127.0.0.1:4173/admin.html?demo=1`.

## Secretos del Worker

Configura `GITHUB_TOKEN`, `ADMIN_PASSWORD_HASH` y `SESSION_SECRET` con `wrangler secret put`. No se guardan en el repositorio; `.dev.vars` está ignorado.
