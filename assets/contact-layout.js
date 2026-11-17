const email = document.querySelector('.contact-email-value');

if (email) {
  let frame;
  let lastWidth = -1;
  const fitEmail = () => {
    const preferred = Number.parseFloat(getComputedStyle(email).getPropertyValue('--email-font-size')) || 16;
    email.style.fontSize = `${preferred}px`;
    email.style.whiteSpace = 'nowrap';
    const available = email.clientWidth;
    if (!available) return;
    if (email.scrollWidth > available) {
      const size = Math.max(12, Math.floor(preferred * available / email.scrollWidth * 4) / 4);
      email.style.fontSize = `${size}px`;
      if (email.scrollWidth > available + 1) email.style.whiteSpace = 'normal';
    }
  };
  const scheduleFit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fitEmail);
  };
  new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (width !== lastWidth) { lastWidth = width; scheduleFit(); }
  }).observe(email);
  new MutationObserver(scheduleFit).observe(email, { childList: true, characterData: true, subtree: true });
  window.addEventListener('formar:content-updated', scheduleFit);
  document.fonts?.ready.then(scheduleFit);
  scheduleFit();
}
