# Inversiones Formar Biolink

Sitio público estático con contenido y frontend versionados en GitHub:

- Público: https://inversionesformar.netlify.app/
- Panel: https://inversionesformar.netlify.app/admin.html
- Frontend, contenido y galerías: GitHub Pages
- API segura del panel: `https://formar-biolink-admin-api.agonzalezpastena7.workers.dev`
- URL pública estable: Netlify funciona únicamente como proxy hacia GitHub Pages

## Flujo de publicación

El panel autentica contra el Worker de Cloudflare. Al pulsar `Publicar cambios`, el Worker valida el contenido y crea un commit en `AlexMGP7/formar-biolink`. GitHub Pages publica el frontend completo, el JSON y las imágenes.

Netlify solo contiene las reglas de `netlify-proxy/` que encaminan el dominio final a GitHub Pages. El workflow `Configure Netlify proxy` es exclusivamente manual y solo debe ejecutarse si cambia esa infraestructura. Los cambios habituales del frontend o del contenido no consumen production deploys de Netlify.

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
