// Markdown do lapidado e das anotações: marked + DOMPurify (cdnjs, versão fixa no index.html).
// Links e imagens relativos (anexos/...) apontam para o anexo certo no repositório.

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let pronto = false;
function preparar() {
  if (pronto || !window.marked) return;
  window.marked.use({ gfm: true, breaks: true });
  pronto = true;
}

export function resolver(base, href) {
  try {
    const u = new URL(href, 'https://x.invalid/' + base.replace(/\/?$/, '/'));
    return decodeURIComponent(u.pathname.slice(1));
  } catch (e) { return null; }
}
const externo = h => /^(https?:|mailto:|tel:)/i.test(h);

// devolve HTML limpo; base = pasta do arquivo (ex.: ideias/soltas/onde-pesquisar-motion)
export function md(text, base, backend) {
  const src = String(text || '').trim();
  if (!src) return '';
  preparar();
  let html;
  if (window.marked && window.DOMPurify) {
    html = window.DOMPurify.sanitize(window.marked.parse(src), { USE_PROFILES: { html: true } });
  } else {
    html = src.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  const t = document.createElement('template');
  t.innerHTML = html;
  t.content.querySelectorAll('a[href]').forEach(a => {
    const h = a.getAttribute('href');
    if (h.startsWith('#')) return;
    if (!externo(h)) {
      const p = resolver(base, h);
      if (p && backend) a.setAttribute('href', backend.anexoHref(p)); else a.removeAttribute('href');
    }
    a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer');
  });
  t.content.querySelectorAll('img[src]').forEach(img => {
    const s = img.getAttribute('src');
    if (externo(s)) { img.setAttribute('loading', 'lazy'); img.setAttribute('referrerpolicy', 'no-referrer'); return; }
    const p = resolver(base, s);
    img.removeAttribute('src');
    if (p) img.dataset.anexo = p;
  });
  t.content.querySelectorAll('input[type="checkbox"]').forEach(i => { i.setAttribute('disabled', ''); i.setAttribute('tabindex', '-1'); });
  return t.innerHTML;
}

// imagens de anexo: pede o arquivo ao backend (object URL no GitHub) e só então mostra
export function hidratar(root, backend) {
  root.querySelectorAll('img[data-anexo]:not([src])').forEach(async img => {
    try { img.src = await backend.anexoURL(img.dataset.anexo); }
    catch (e) { img.replaceWith(Object.assign(document.createElement('span'), { className: 'img-falha', textContent: 'imagem indisponível' })); }
  });
}
