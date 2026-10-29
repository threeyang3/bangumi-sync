(() => {
  'use strict';

  const navButton = document.querySelector('.nav-toggle');
  const mobileNav = document.querySelector('#mobile-nav');

  function closeMenu() {
    if (!navButton || !mobileNav) return;
    mobileNav.hidden = true;
    navButton.setAttribute('aria-expanded', 'false');
    navButton.setAttribute('aria-label', '打开导航');
  }

  if (navButton && mobileNav) {
    navButton.addEventListener('click', () => {
      const open = mobileNav.hidden;
      mobileNav.hidden = !open;
      navButton.setAttribute('aria-expanded', String(open));
      navButton.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
    });
    mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', event => {
      if (event.matches) closeMenu();
    });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  const announce = document.getElementById('announce');
  function status(message) {
    if (announce) announce.textContent = message;
  }

  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = '已复制 ✓';
        status('仓库名称已复制');
        window.setTimeout(() => { button.textContent = '复制'; }, 2100);
      } catch {
        status('无法自动复制，请手动选择并复制仓库名称');
        const name = document.getElementById('repo-name');
        if (name) {
          const range = document.createRange();
          range.selectNodeContents(name);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    });
  });

  const lightbox = document.getElementById('lightbox');
  if (lightbox instanceof HTMLDialogElement) {
    const image = lightbox.querySelector('img');
    const caption = lightbox.querySelector('p');
    document.querySelectorAll('[data-image]').forEach(button => {
      button.addEventListener('click', () => {
        if (!image || !caption) return;
        image.src = button.getAttribute('data-image') || '';
        image.alt = button.getAttribute('data-alt') || '插件截图';
        caption.textContent = image.alt;
        if (typeof lightbox.showModal === 'function') {
          lightbox.showModal();
        } else {
          window.open(image.src, '_blank', 'noopener,noreferrer');
        }
      });
    });
    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener('close', () => {
      if (image) image.removeAttribute('src');
    });
  }

  // Public metadata only; no token, analytics, tracking, or personal data.
  // A network failure leaves the bundled, last-known version label intact.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);
  fetch('https://api.github.com/repos/threeyang3/bangumi-sync/releases/latest', {
    signal: controller.signal,
    headers: { 'Accept': 'application/vnd.github+json' }
  }).then(response => {
    if (!response.ok) throw new Error('Release metadata unavailable');
    return response.json();
  }).then(release => {
    if (typeof release.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(release.tag_name)) return;
    document.querySelectorAll('[data-version]').forEach(node => {
      node.textContent = release.tag_name.replace(/^v/, '');
    });
  }).catch(() => {}).finally(() => window.clearTimeout(timeout));
})();
