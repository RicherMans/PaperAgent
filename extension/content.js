// PaperAgent - Content Script
// Injects a "在 PaperAgent 中打开" button on arXiv paper pages

(function () {
  'use strict';

  const BUTTON_ID = 'paperagent-open-btn';

  // ─── arXiv URL Extraction ──────────────────────────────────────────────

  function getArxivUrl() {
    if (window.location.pathname.startsWith('/abs/')) {
      return window.location.href;
    }

    const pdfMatch = window.location.pathname.match(/\/pdf\/(.+?)(\.pdf)?$/);
    if (pdfMatch) return 'https://arxiv.org/abs/' + pdfMatch[1];

    const htmlMatch = window.location.pathname.match(/\/html\/(.+?)(\.html)?$/);
    if (htmlMatch) return 'https://arxiv.org/abs/' + htmlMatch[1];

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href.includes('arxiv.org/abs/')) return canonical.href;

    const absLink = document.querySelector('a[href*="/abs/"]');
    if (absLink) {
      const href = absLink.getAttribute('href');
      return href.startsWith('http') ? href : 'https://arxiv.org' + href;
    }

    return window.location.href;
  }

  // ─── Injection ─────────────────────────────────────────────────────────

  function inject() {
    if (document.getElementById(BUTTON_ID)) return;

    // Find the full-text <ul> where "View PDF" / "TeX Source" live
    const ul = document.querySelector('.full-text ul');
    if (!ul) return;

    // List item
    const li = document.createElement('li');
    li.id = BUTTON_ID;

    // Link — uses arXiv's native .abs-button styling
    const a = document.createElement('a');
    a.className = 'abs-button';
    a.href = '#';
    a.textContent = '在 PaperAgent 中打开';

    let loading = false;
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      if (loading) return;
      loading = true;
      a.textContent = '连接中...';
      a.style.opacity = '0.7';

      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'OPEN_IN_PAPERAGENT',
          url: getArxivUrl(),
        });
        if (!resp || !resp.ok) throw new Error(resp?.error || '打开失败');
      } catch (err) {
        a.textContent = '连接失败，点击重试';
        a.style.opacity = '1';
        setTimeout(() => {
          a.textContent = '在 PaperAgent 中打开';
          loading = false;
        }, 3000);
      }
    });

    li.appendChild(a);
    ul.appendChild(li);
  }

  // ─── Init ──────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  // Retry on DOM mutations (arXiv might load dynamically)
  let retries = 0;
  const observer = new MutationObserver(() => {
    if (!document.getElementById(BUTTON_ID) && retries < 10) {
      retries++;
      inject();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
