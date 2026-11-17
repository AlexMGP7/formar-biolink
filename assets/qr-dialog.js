(() => {
  const openers = document.querySelectorAll('[data-qr-open]');
  if (!openers.length) return;
  const publicUrl = document.querySelector('meta[name="public-url"]').content;
  const dialog = document.createElement('dialog');
  dialog.className = 'formar-qr-dialog';
  dialog.setAttribute('aria-labelledby', 'formarQrTitle');
  dialog.innerHTML = `
    <div class="formar-qr-head"><h2 id="formarQrTitle">Código QR de Formar</h2><button class="formar-qr-close" type="button" aria-label="Cerrar código QR">×</button></div>
    <img class="formar-qr-image" width="1024" height="1024" alt="Código QR para abrir la página de Inversiones Formar">
    <p class="formar-qr-help">Descárgalo para compartir o imprimir. El mismo QR sigue funcionando cuando actualizas la información de la página.</p>
    <label class="formar-qr-link-label" for="formarQrLink">Enlace de la página</label><input class="formar-qr-link" id="formarQrLink" type="url" readonly>
    <div class="formar-qr-actions"><a class="formar-qr-action primary" href="assets/qr/formar.png" download="QR-Inversiones-Formar.png">Descargar PNG</a><a class="formar-qr-action" href="assets/qr/formar.svg" download="QR-Inversiones-Formar.svg">SVG para imprenta</a></div>
    <button class="formar-qr-action formar-qr-copy" type="button">Copiar enlace</button><p class="formar-qr-status" role="status" aria-live="polite"></p>`;
  document.body.appendChild(dialog);
  dialog.querySelector('img').src = new URL('qr/formar.png', import.meta.url).href;
  dialog.querySelectorAll('a[download]').forEach(link => {
    const format = link.download.endsWith('.svg') ? 'svg' : 'png';
    link.href = new URL(`qr/formar.${format}`, import.meta.url).href;
  });
  const linkInput = dialog.querySelector('input');
  const status = dialog.querySelector('[role="status"]');
  linkInput.value = publicUrl;
  let opener;
  openers.forEach(button => button.addEventListener('click', () => {
    opener = button;
    status.textContent = '';
    if (!dialog.open) dialog.showModal();
  }));
  dialog.querySelector('.formar-qr-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => opener?.focus());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.querySelector('.formar-qr-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      status.textContent = 'Enlace copiado.';
    } catch {
      linkInput.focus();
      linkInput.select();
      status.textContent = 'Selecciona y copia el enlace de arriba.';
    }
  });
})();
