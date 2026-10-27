// BRAINSTORM · app (direção "Diagrama"). Interface portada do protótipo aprovado; dados vêm dos arquivos.
import CONFIG from '../config.js';
import { GitHubBackend } from './github.js';
import { LocalBackend } from './local.js';
import { Store } from './sync.js';
import { AREAS, AREA, temPedido } from './modelo.js';
import { slug as fazerSlug, novaDirecao } from './formato.js';
import { md, hidratar } from './markdown.js';
import { criarEtapas, nomeEtapa } from './etapas.js';
import { total as totalTarefas } from './plano.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  plus: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  dive: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  pen: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  branch: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h6l5-5h5"/><path d="M10 12l5 5h5"/><circle cx="4" cy="12" r="1.5"/></svg>',
  drawer: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h5l1.5 2.5h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/></svg>',
  back: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l-6 6 6 6"/><path d="M3 12h11a6 6 0 0 1 6 6"/></svg>',
  link: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  x: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
  edicao: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h13"/><path d="M12 7l5 5-5 5"/><circle cx="20" cy="12" r="1.6"/></svg>',
  kanban: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16M12 4v10M19 4v6"/><circle cx="5" cy="20" r="1.5"/><circle cx="12" cy="14" r="1.5"/><circle cx="19" cy="10" r="1.5"/></svg>',
  check: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  esq: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  dir: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  cima: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  baixo: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
};

/* ---------------- armazenamento local (só conveniências deste navegador) ---------------- */
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
};
const tokenGet = () => { try { return localStorage.getItem('bs-token') || ''; } catch (e) { return ''; } };
const tokenSet = t => { try { localStorage.setItem('bs-token', t); } catch (e) { /* sem armazenamento: vale só nesta aba */ } };
const tokenDel = () => { try { localStorage.removeItem('bs-token'); } catch (e) { /* nada */ } };

const params = new URLSearchParams(location.search);
const LOCAL = params.has('local');

let backend = null, store = null;
const UI = Object.assign({ path: [], sel: null, etapa: 'brainstorm', ed: null, kb: null }, ls.get('bs-ui', {}));
if (!['brainstorm', 'edicao', 'kanban'].includes(UI.etapa)) UI.etapa = 'brainstorm';
UI.hl = null;
const saveUI = () => ls.set('bs-ui', { path: UI.path, sel: UI.sel, etapa: UI.etapa, ed: UI.ed, kb: UI.kb });
const M = () => store.model;

/* ---------------- dados → tela ---------------- */
function ideiaPorKey(k) { return M().ideias.find(i => i.key === k); }
function resolve(path) {
  if (!path || !path.length) return null;
  const idea = ideiaPorKey(path[0]); if (!idea || idea.estado !== 'ativa') return null;
  const chain = [idea], idx = [];
  let node = idea;
  for (let k = 1; k < path.length; k++) {
    const i = node.direcoes.findIndex(d => d.slug === path[k]);
    if (i < 0) return null;
    node = node.direcoes[i]; chain.push(node); idx.push(i);
  }
  return { idea, node, chain, idx };
}
function seg(depth, i) {
  if (depth === 1) return String.fromCharCode(65 + (i % 26));
  if (depth % 2 === 0) return String(i + 1);
  return String.fromCharCode(97 + (i % 26));
}
const suffix = idx => idx.map((i, k) => seg(k + 1, i)).join('');
const ideaCode = idea => idea.codigo || '';
const codigoDir = (idea, c) => [ideaCode(idea), c].filter(Boolean).join('.');
const fmtData = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}` : ''; };
const fmtDataBR = s => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${+m[1]} ${MESES[+m[2] - 1]} ${m[3]}` : s; };
const areaNome = id => (AREA[id] || {}).nome || id;
const viewKey = () => UI.path.length ? UI.path.join('/') : 'geral';
const linkar = s => esc(s).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)"'”]/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).replace(/\n/g, '<br>');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
// títulos que fechariam a seção no arquivo (## dentro do Lapidado, ### dentro das Anotações) descem um nível
function rebaixar(text, min) {
  let fence = false;
  return String(text).split('\n').map(l => {
    if (/^\s{0,3}(```|~~~)/.test(l)) { fence = !fence; return l; }
    if (fence) return l;
    const m = l.match(/^(#{1,6})([ \t]+.*)$/);
    return m && m[1].length < min ? '#'.repeat(min) + m[2] : l;
  }).join('\n');
}

/* ---------------- roteamento 45°/90° ---------------- */
const f1 = n => Math.round(n * 10) / 10;
function route(a, b, bias, r) {
  const dx = b.x - a.x, dy = b.y - a.y, adx = Math.abs(dx), ady = Math.abs(dy);
  const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
  let pts;
  if (adx >= ady) { const s = adx - ady, s1 = s * bias; pts = [[a.x, a.y], [a.x + sx * s1, a.y], [a.x + sx * (s1 + ady), b.y], [b.x, b.y]]; }
  else { const s = ady - adx, s1 = s * bias; pts = [[a.x, a.y], [a.x, a.y + sy * s1], [b.x, a.y + sy * (s1 + adx)], [b.x, b.y]]; }
  const P = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
  let d = `M${f1(P[0][0])},${f1(P[0][1])}`;
  for (let i = 1; i < P.length - 1; i++) {
    const [px, py] = P[i - 1], [cx, cy] = P[i], [nx, ny] = P[i + 1];
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += ` L${f1(cx + (px - cx) / l1 * rr)},${f1(cy + (py - cy) / l1 * rr)} Q${f1(cx)},${f1(cy)} ${f1(cx + (nx - cx) / l2 * rr)},${f1(cy + (ny - cy) / l2 * rr)}`;
  }
  const L = P[P.length - 1]; d += ` L${f1(L[0])},${f1(L[1])}`;
  return d;
}

/* ---------------- posições: unidades do mapa ----------------
   pos nos arquivos = deslocamento em relação à mãe, em unidades de um mapa de 1000 × 700
   (≈ pixels no notebook). Assim a mesma posição serve em telas de tamanhos diferentes. */
const REF_W = 1000, REF_H = 700;
const paraU = (dx, dy) => [Math.round(dx / (G.W / REF_W)), Math.round(dy / (G.H / REF_H))];

/* ---------------- grafo de cada tela ---------------- */
function labelSide(x, y, cx, cy, W, prefer, min = 150) {
  let side = prefer;
  const roomR = W - x - 34, roomL = x - 34;
  if (side === 'r' && roomR < min) side = y < cy - 4 ? 't' : 'b';
  if (side === 'l' && roomL < min) side = y < cy - 4 ? 't' : 'b';
  const mw = side === 'r' ? Math.min(230, roomR) : side === 'l' ? Math.min(230, roomL) : 170;
  return { side, mw };
}
function buildGraph(W, H) {
  const nodes = [], edges = [];
  const add = n => { nodes.push(n); return n; };
  let start = 0, step = 360;
  if (!UI.path.length) {
    const cx = W / 2, cy = H * 0.45;
    add({ id: 'root', kind: 'root', x: cx, y: cy, depth: 0 });
    const quad = { youtube: [-1, -1], instagram: [1, -1], tatuagem: [-1, 1], soltas: [1, 1] };
    AREAS.forEach(a => {
      const [sx, sy] = quad[a.id]; const col = a.c;
      const ax = cx + sx * W * 0.17, ay = cy + sy * H * 0.25;
      const ideas = M().ideias.filter(i => i.area === a.id && i.estado === 'ativa');
      const aid = 'a:' + a.id;
      add({ id: aid, kind: 'area', area: a.id, x: ax, y: ay, parent: 'root', color: col, r: 15, side: (sy < 0 ? 't' : 'b') + (sx < 0 ? ' al' : ' ar'), mw: 240, depth: 1,
        title: a.nome, meta: ideas.length ? `${ideas.length} ${ideas.length > 1 ? 'ideias ativas' : 'ideia ativa'}` : 'sem ideias ainda' });
      edges.push({ from: 'root', to: aid, color: col, w: 10, bias: .5, depth: 1 });
      const ox = cx + sx * W * 0.33;
      if (!ideas.length) {
        const gy = ay + sy * H * 0.15;
        const ls_ = labelSide(ox, gy, cx, cy, W, sx < 0 ? 'l' : 'r');
        add({ id: 'g:' + a.id, kind: 'ghost', area: a.id, x: ox, y: gy, parent: aid, color: col, r: 10, side: ls_.side, mw: Math.min(ls_.mw, 210), depth: 2,
          title: 'A próxima ideia de ' + a.nome.toLowerCase() + ' abre esta estação', meta: 'linha em obras' });
        edges.push({ from: aid, to: 'g:' + a.id, color: col, w: 6, bias: .2, depth: 2, dash: true });
      } else {
        const n = ideas.length;
        const st = n > 1 ? Math.min(H * 0.24, (H * 0.74) / (n - 1)) : 0;
        ideas.forEach((it, k) => {
          let y = ay + (k - (n - 1) / 2) * st; y = Math.max(H * 0.09, Math.min(H * 0.91, y));
          const ls_ = labelSide(ox, y, cx, cy, W, sx < 0 ? 'l' : 'r', 120);
          const nd = it.direcoes.length;
          const meta = [ideaCode(it), plural(nd, 'direção', 'direções'), temPedido(it) ? 'pedido ao Claude' : ''].filter(Boolean).join(' · ');
          add({ id: 'i:' + it.key, kind: 'idea', area: a.id, ref: it, x: ox, y, parent: aid, color: col, r: 10, side: ls_.side, mw: ls_.mw, depth: 2,
            title: it.titulo, meta, pedido: temPedido(it) });
          edges.push({ from: aid, to: 'i:' + it.key, color: col, w: 8, bias: .2, depth: 2 });
        });
      }
    });
  } else {
    const R = resolve(UI.path); const { idea, node: center, idx } = R;
    const col = AREA[idea.area].c;
    const cx = W * 0.5, cy = H * 0.44;
    const isIdea = UI.path.length === 1;
    const csuf = suffix(idx);
    add({ id: 'c', kind: 'center', ref: center, x: cx, y: cy, color: col, r: 27, side: 'b', mw: 300, depth: 0, pedido: !!center.pedido,
      title: center.titulo, meta: isIdea ? [ideaCode(idea), areaNome(idea.area)].filter(Boolean).join(' · ') : `${codigoDir(idea, csuf)} · direção`,
      code: isIdea ? AREA[idea.area].b : csuf });
    const kids = center.direcoes;
    const n = kids.length; step = 360 / Math.max(n, 1);
    const pi = kids.findIndex(d => d.direcoes.length);
    start = pi >= 0 ? -pi * step : (n === 1 ? 0 : (n % 2 ? -90 : -90 + step / 2));
    const rx = W * 0.33, ry = H * 0.34;
    kids.forEach((d, i) => {
      const th = (start + i * step) * Math.PI / 180;
      const hasKids = d.direcoes.length > 0;
      const k = hasKids ? 0.72 : 1;
      let x = cx + rx * k * Math.cos(th), y = cy + ry * k * Math.sin(th);
      const c = Math.cos(th), s = Math.sin(th);
      const prefer = c > 0.3 ? 'r' : c < -0.3 ? 'l' : (s < 0 ? 't' : 'b');
      let ls_ = labelSide(x, y, cx, cy, W, prefer);
      if (hasKids) ls_ = { side: s < -0.3 ? 't' : 'b', mw: 170 };
      x = Math.max(ls_.side === 'b' || ls_.side === 't' ? 90 : 30, Math.min(W - (ls_.side === 'b' || ls_.side === 't' ? 90 : 30), x));
      // direção com galhos: deixa espaço para os nomes dos galhos caberem na tela
      if (hasKids) { const SUB = 96 + 150; x = c >= 0 ? Math.max(cx + 60, Math.min(x, W - SUB)) : Math.min(cx - 60, Math.max(x, SUB)); }
      const code = csuf + seg(idx.length + 1, i);
      const meta = [code, hasKids ? `${d.direcoes.length} dentro` : '', !d.lapidado ? 'nova' : '', d.pedido ? 'pedido ao Claude' : ''].filter(Boolean).join(' · ');
      const id = 'd:' + d.slug;
      add({ id, kind: 'dir', ref: d, slug: d.slug, hasKids, x, y, parent: 'c', color: col, r: 11, side: ls_.side, mw: ls_.mw, depth: 1, title: d.titulo, meta, code, pedido: !!d.pedido, novo: !!d.provisorio, th });
      edges.push({ from: 'c', to: id, color: col, w: 7, bias: 0, depth: 1 });
      if (hasKids) {
        const out = c >= 0 ? 1 : -1, m = d.direcoes.length;
        d.direcoes.forEach((sd, j) => {
          const sxp = x + out * 96, syp = Math.max(24, Math.min(H - 24, y + (j - (m - 1) / 2) * 40));
          const sid = id + '>' + sd.slug;
          add({ id: sid, kind: 'sub', ref: sd, owner: d, x: sxp, y: syp, parent: id, color: col, r: 6, side: out > 0 ? 'r' : 'l', mw: 190, depth: 2,
            title: sd.titulo, code: code + seg(idx.length + 2, j), pedido: !!sd.pedido });
          edges.push({ from: id, to: sid, color: col, w: 4, bias: 0, depth: 2 });
        });
      } else if (d.pedido) {
        add({ id: 'o:' + d.slug, kind: 'obras', parent: id, color: col, r: 6, x, y, depth: 2, obras: true });
        edges.push({ from: id, to: 'o:' + d.slug, color: col, w: 5, bias: 0, depth: 2, obras: true });
      }
    });
    if (!n) {
      const gx = cx + W * 0.26, gy = cy - H * 0.2;
      add({ id: 'g:vazio', kind: 'ghost', vazio: true, x: gx, y: gy, parent: 'c', color: col, r: 10, side: 'r', mw: Math.min(220, W - gx - 40), depth: 1,
        title: center.pedido ? 'As direções do Claude saem daqui' : 'Ainda sem direções', meta: center.pedido ? 'linha em obras' : 'N cria uma · Desenvolver pede ao Claude' });
      edges.push({ from: 'c', to: 'g:vazio', color: col, w: 6, bias: .3, depth: 1, dash: true, obras: !!center.pedido });
    }
  }
  const byId = {}; nodes.forEach(nd => byId[nd.id] = nd);
  // posições guardadas: relativas à mãe, aplicadas de cima para baixo
  const sx = W / REF_W, sy = H / REF_H;
  const vk = viewKey();
  const pan = (ls.get('bs-pan', {})[vk]) || null;
  const subPos = (ls.get('bs-subpos', {})[vk]) || {};
  const areasPos = (store.mapa && store.mapa.areas) || {};
  const def = {}; nodes.forEach(nd => def[nd.id] = [nd.x, nd.y]);
  const ok2 = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
  nodes.forEach(nd => {
    if (nd.obras) return;
    const P = nd.parent && byId[nd.parent];
    if (!P) { if (ok2(pan)) { nd.x += pan[0] * sx; nd.y += pan[1] * sy; nd.moved = true; } return; }
    let saved = null;
    if (nd.kind === 'area') saved = areasPos[nd.area];
    else if (nd.kind === 'idea' || nd.kind === 'dir') saved = nd.ref.pos;
    else if (nd.kind === 'sub') saved = subPos[nd.id];
    saved = ok2(saved) ? saved : null;
    const off = saved ? [saved[0] * sx, saved[1] * sy] : [def[nd.id][0] - def[P.id][0], def[nd.id][1] - def[P.id][1]];
    nd.x = Math.max(24, Math.min(W - 24, P.x + off[0]));
    nd.y = Math.max(24, Math.min(H - 24, P.y + off[1]));
    nd.moved = !!saved || !!P.moved;
  });
  nodes.forEach(nd => {
    if (nd.obras) {
      const p = byId[nd.parent], c = byId.c;
      const dir = p.side === 't' ? 1 : p.side === 'b' ? -1 : (p.y < c.y ? -1 : 1);
      const hx = p.x < c.x ? -1 : 1;
      nd.x = Math.max(16, Math.min(W - 16, p.x + hx * 36)); nd.y = Math.max(16, Math.min(H - 16, p.y + dir * 58));
    }
  });
  // galhos sem posição guardada: se o nome não cabe de um lado da tela, vão para o outro
  const NOME = 150, BR = 96;
  nodes.forEach(nd => {
    if (nd.kind !== 'sub' || ok2(subPos[nd.id])) return;
    const p = byId[nd.parent];
    if (nd.side === 'r' && p.x + BR + NOME > W && p.x - BR - NOME >= 0) { nd.x = p.x - BR; nd.side = 'l'; }
    else if (nd.side === 'l' && p.x - BR - NOME < 0 && p.x + BR + NOME <= W) { nd.x = p.x + BR; nd.side = 'r'; }
  });
  nodes.forEach(nd => { if ((nd.kind === 'idea' || nd.kind === 'dir' || nd.kind === 'ghost') && !nd.hasKids) { nd.pref = nd.side; nd.mw0 = nd.mw; } });
  return { nodes, edges, byId, start, step };
}

/* ---------------- render do mapa ---------------- */
const mapEl = $('#map'), mainEl = $('#main');
/* câmera do mapa: zoom e passeio, sem mexer nas posições gravadas */
const camEl = document.createElement('div'); camEl.className = 'cam'; mapEl.insertBefore(camEl, mapEl.firstChild);
const CAM = { z: 1, x: 0, y: 0 }, ZMIN = 0.3, ZMAX = 2.5;
function applyCam() {
  camEl.style.transform = `translate(${f1(CAM.x)}px,${f1(CAM.y)}px) scale(${CAM.z})`;
  const g = 24 * CAM.z;
  mapEl.style.backgroundSize = `${g}px ${g}px`;
  mapEl.style.backgroundPosition = `${f1(CAM.x + 12 * CAM.z)}px ${f1(CAM.y + 12 * CAM.z)}px`;
  const zl = $('#zoomNivel'); if (zl) zl.textContent = Math.round(CAM.z * 100) + '%';
}
function zoomEm(px, py, fator) {
  const z = Math.min(ZMAX, Math.max(ZMIN, CAM.z * fator)); if (z === CAM.z) return;
  CAM.x = px - (px - CAM.x) * (z / CAM.z); CAM.y = py - (py - CAM.y) * (z / CAM.z); CAM.z = z; applyCam();
}
function zoomCentro(fator) { const r = mapEl.getBoundingClientRect(); zoomEm(r.width / 2, r.height / 2, fator); }
function camReset() { CAM.z = 1; CAM.x = 0; CAM.y = 0; applyCam(); }
const ptMapa = e => { const r = mapEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const foraDoMapa = t => t.closest('.st, .map-ui, .atalhos, .estado, .cartouche, button, input, textarea, a');
mapEl.addEventListener('wheel', e => {
  if (!store || e.target.closest('.atalhos, .estado')) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) { const [px, py] = ptMapa(e); zoomEm(px, py, Math.exp(-e.deltaY * 0.01)); }
  else { CAM.x -= e.deltaX; CAM.y -= e.deltaY; applyCam(); }
}, { passive: false });
// Safari no Mac: pinça do trackpad chega como gesture
let gesto = 1;
mapEl.addEventListener('gesturestart', e => { e.preventDefault(); gesto = 1; });
mapEl.addEventListener('gesturechange', e => { e.preventDefault(); const [px, py] = ptMapa(e); zoomEm(px, py, e.scale / gesto); gesto = e.scale; });
// arrastar o fundo passeia; dois dedos no fundo dão zoom
const dedos = new Map(); let passeio = null;
mapEl.addEventListener('pointerdown', e => {
  if (!store || drag || busy || foraDoMapa(e.target)) return;
  dedos.set(e.pointerId, ptMapa(e));
  try { mapEl.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
  if (dedos.size === 1) { passeio = { x0: e.clientX, y0: e.clientY, cx: CAM.x, cy: CAM.y }; mapEl.classList.add('is-pan'); }
  else { passeio = null; const [a, b] = [...dedos.values()]; passeio = { pinca: Math.hypot(a[0] - b[0], a[1] - b[1]) }; }
});
mapEl.addEventListener('pointermove', e => {
  if (!dedos.has(e.pointerId)) return;
  dedos.set(e.pointerId, ptMapa(e));
  if (!passeio) return;
  if (passeio.pinca && dedos.size >= 2) {
    const [a, b] = [...dedos.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    zoomEm((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / passeio.pinca); passeio.pinca = d;
  } else if (!passeio.pinca) { CAM.x = passeio.cx + e.clientX - passeio.x0; CAM.y = passeio.cy + e.clientY - passeio.y0; applyCam(); }
});
const fimPasseio = e => { dedos.delete(e.pointerId); if (!dedos.size) { passeio = null; mapEl.classList.remove('is-pan'); } };
mapEl.addEventListener('pointerup', fimPasseio); mapEl.addEventListener('pointercancel', fimPasseio);
$('#zoomMais').addEventListener('click', () => zoomCentro(1.25));
$('#zoomMenos').addEventListener('click', () => zoomCentro(0.8));
$('#zoomNivel').addEventListener('click', camReset);
let G = { nodes: [], edges: [], byId: {}, W: 0, H: 0, world: null, svg: null, start: 0, step: 360 };
let raf = 0, drag = null, busy = false, clickT = 0;

function descendants(id) {
  const out = []; const walk = pid => G.nodes.forEach(n => { if (n.parent === pid) { out.push(n); walk(n.id); } }); walk(id); return out;
}
function ancestors(n) { const out = []; let p = n.parent; while (p) { out.push(p); p = G.byId[p] && G.byId[p].parent; } return out; }

function nodeHTML(n) {
  const style = `--r:${n.r || 0}px;--c:${n.color || '#111'};--mw:${Math.round(n.mw || 220)}px`;
  if (n.kind === 'root') return { cls: 'st st--root', style, html: '<span class="cap">BRAINSTORM</span>', label: 'BRAINSTORM, centro do mapa geral' };
  if (n.kind === 'obras') return { cls: 'st st--obras', style, html: '<span class="dot"></span>', label: '' };
  const sel = (n.kind === 'dir' && UI.sel === n.slug) || (n.kind === 'center' && !UI.sel);
  let inner = '';
  if (n.kind === 'center') {
    inner = `<span class="dot">${esc(n.code)}</span><span class="lbl b"><span class="ttl" data-ttl>${esc(n.title)}</span><span class="meta">${esc(n.meta)}</span></span>`;
  } else if (n.kind === 'sub') {
    inner = `<span class="dot"></span><span class="lbl ${n.side}"><span class="ttl" title="${esc(n.title)}">${esc(n.title)}</span></span>`;
  } else {
    const metaFirst = n.side.startsWith('t');
    const meta = `<span class="meta">${esc(n.meta)}</span>`;
    const open = n.hasKids ? `<span class="meta open">clique de novo para abrir</span>` : '';
    inner = `<span class="dot"></span><span class="lbl ${n.side}">${metaFirst ? meta : ''}<span class="ttl" data-ttl>${esc(n.title)}</span>${metaFirst ? '' : meta}${open}</span>`;
  }
  const label = n.kind === 'idea' ? `Abrir ideia: ${n.title}` : n.kind === 'area' ? `Área ${n.title}, ${n.meta}` : n.kind === 'dir' ? `Direção ${n.code}: ${n.title}` : n.kind === 'sub' ? `Direção ${n.code}: ${n.title}` : n.kind === 'ghost' ? `${n.title}. ${n.meta}` : n.title;
  return { cls: `st st--${n.kind}${sel ? ' is-sel' : ''}${n.pedido ? ' is-pedido' : ''}${n.novo ? ' is-novo' : ''}`, style, html: inner, label };
}

function renderMap(opts = {}) {
  if (!store) return;
  if (UI.path.length && !resolve(UI.path)) { UI.path = []; UI.sel = null; saveUI(); }
  const rect = mapEl.getBoundingClientRect();
  const W = Math.max(320, rect.width), H = Math.max(320, rect.height);
  const prev = G.byId;
  G.W = W; G.H = H;
  const g = buildGraph(W, H);
  const focusedId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.id : null;
  if (G.world) G.world.remove();
  const world = document.createElement('div'); world.className = 'world';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'lines'); svg.setAttribute('aria-hidden', 'true');
  world.appendChild(svg);
  g.edges.forEach(e => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('class', 'edge' + (e.dash ? ' edge--dash' : '') + (e.obras ? ' edge--obras' : ''));
    p.setAttribute('stroke', e.color); p.setAttribute('stroke-width', e.w);
    svg.appendChild(p); e.el = p;
  });
  g.nodes.forEach(n => {
    const old = prev[n.id];
    if (opts.keep && old) { n.cx = old.cx; n.cy = old.cy; }
    else if (opts.keep && n.parent && prev[n.parent]) { n.cx = prev[n.parent].cx; n.cy = prev[n.parent].cy; }
    else { n.cx = n.x; n.cy = n.y; }
    const h = nodeHTML(n);
    const el = document.createElement('button');
    el.type = 'button'; el.className = h.cls; el.setAttribute('style', h.style); el.innerHTML = h.html; el.dataset.id = n.id;
    if (h.label) el.setAttribute('aria-label', h.label);
    if (n.kind === 'obras') { el.tabIndex = -1; el.setAttribute('aria-hidden', 'true'); }
    if (n.kind === 'ghost' && !n.vazio) el.setAttribute('aria-disabled', 'true');
    if (n.kind === 'dir' || n.kind === 'center') el.setAttribute('aria-pressed', String((n.kind === 'dir' && UI.sel === n.slug) || (n.kind === 'center' && !UI.sel)));
    n.el = el; bindNode(n);
    world.appendChild(el);
  });
  camEl.appendChild(world);
  G = { nodes: g.nodes, edges: g.edges, byId: g.byId, W, H, world, svg, start: g.start, step: g.step };
  applyDim();
  G.nodes.forEach(n => { if (n.moved) relabel(n); });
  G.nodes.forEach(place); updateEdges();
  if (opts.enter && !RM.matches) enterAnim();
  if (opts.keep) kick();
  if (focusedId && G.byId[focusedId]) G.byId[focusedId].el.focus({ preventScroll: true });
  renderMapUI();
}
function place(n) { n.el.style.transform = `translate(${f1(n.cx)}px,${f1(n.cy)}px)`; }
function updateEdges() {
  G.edges.forEach(e => {
    const a = G.byId[e.from], b = G.byId[e.to]; if (!a || !b) return;
    e.el.setAttribute('d', route({ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }, e.bias, e.w > 6 ? 22 : 12));
  });
}
function enterAnim() {
  const STEP = 300;
  G.edges.forEach(e => {
    if (e.dash || e.obras) { e.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: e.depth * STEP, fill: 'backwards' }); return; }
    const len = e.el.getTotalLength(); if (!len) return;
    e.el.style.strokeDasharray = len; e.el.style.strokeDashoffset = len;
    const a = e.el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: STEP, delay: (e.depth - 1) * STEP, easing: 'cubic-bezier(0,0,.2,1)', fill: 'forwards' });
    a.onfinish = () => { e.el.style.strokeDasharray = ''; e.el.style.strokeDashoffset = ''; a.cancel(); };
  });
  G.nodes.forEach(n => { n.el.style.setProperty('--dl', (n.depth * STEP) + 'ms'); n.el.classList.add('pop'); });
  setTimeout(() => G.nodes.forEach(n => n.el && n.el.classList.remove('pop')), 2 * STEP + 400);
}
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function tick() {
  raf = 0; let moving = false; const k = RM.matches ? 1 : 0.24;
  G.nodes.forEach(n => {
    if (drag && drag.n === n) return;
    const dx = n.x - n.cx, dy = n.y - n.cy;
    if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) { n.cx += dx * k; n.cy += dy * k; moving = true; }
    else { n.cx = n.x; n.cy = n.y; }
    place(n);
  });
  updateEdges();
  if (moving || drag) raf = requestAnimationFrame(tick);
}
function applyDim() {
  const hl = !UI.path.length ? UI.hl : null;
  G.nodes.forEach(n => n.el.classList.toggle('dim', !!hl && n.kind !== 'root' && n.area !== hl));
  G.edges.forEach(e => { const b = G.byId[e.to]; e.el.classList.toggle('dim', !!hl && b && b.area !== hl); });
}

/* ---------------- interação nos nós ---------------- */
function bindNode(n) {
  const el = n.el;
  if (n.kind === 'obras') return;
  if (n.kind === 'ghost') {
    el.addEventListener('click', () => {
      if (n.vazio) { if (!resolve(UI.path).node.pedido) newDirection(); else toast('O Claude está desenvolvendo. As direções aparecem aqui sozinhas.'); }
      else toast(`Linha ${areaNome(n.area)} sem estações. Manda a próxima ideia pelo Claude Code.`);
    });
    return;
  }
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || busy || e.target.closest('.ren')) return;
    const snapshot = {}; G.nodes.forEach(o => snapshot[o.id] = [o.x, o.y]);
    const desc = n.kind === 'root' || n.kind === 'center' ? G.nodes.filter(o => o !== n) : descendants(n.id);
    drag = { n, el, x0: e.clientX, y0: e.clientY, nx: n.x, ny: n.y, moved: false, snapshot, desc, anc: ancestors(n), pid: e.pointerId };
  });
  el.addEventListener('click', e => {
    if (el._dragged) { el._dragged = false; e.preventDefault(); return; }
    if (e.target.closest('.ren')) return;
    onNodeClick(n);
  });
  if (n.kind === 'dir' || n.kind === 'center') {
    el.addEventListener('dblclick', e => { e.preventDefault(); clearTimeout(clickT); startRename(n.kind === 'center' ? null : n.slug); });
  }
}
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = (e.clientX - drag.x0) / CAM.z, dy = (e.clientY - drag.y0) / CAM.z;
  if (!drag.moved) {
    if (Math.hypot(dx, dy) * CAM.z < 5) return;
    drag.moved = true; drag.el.classList.add('is-drag');
    try { drag.el.setPointerCapture(drag.pid); } catch (err) { /* sem captura */ }
  }
  const n = drag.n;
  n.x = n.cx = Math.max(-2 * G.W, Math.min(3 * G.W, drag.nx + dx));
  n.y = n.cy = Math.max(-2 * G.H, Math.min(3 * G.H, drag.ny + dy));
  const mdx = n.x - drag.nx, mdy = n.y - drag.ny;
  const descSet = new Set(drag.desc.map(o => o.id));
  drag.desc.forEach(o => { const s = drag.snapshot[o.id]; o.x = s[0] + mdx; o.y = s[1] + mdy; });
  // vizinhos abrem espaço: volta todos à base e empurra quem ficou perto demais
  const movable = G.nodes.filter(o => !(o === n || descSet.has(o.id) || drag.anc.includes(o.id) || o.kind === 'root' || o.kind === 'center'));
  movable.forEach(o => { const s = drag.snapshot[o.id]; o.x = s[0]; o.y = s[1]; });
  movable.forEach(o => {
    if (o.obras || o.kind === 'sub') return;
    const s = drag.snapshot[o.id]; const vx = s[0] - n.x, vy = s[1] - n.y, d = Math.hypot(vx, vy) || 0.01;
    const MIN = 88;
    if (d < MIN) {
      const push = MIN - d, px = vx / d * push, py = vy / d * push;
      o.x = s[0] + px; o.y = s[1] + py;
      descendants(o.id).forEach(q => { const sq = drag.snapshot[q.id]; q.x = sq[0] + px; q.y = sq[1] + py; });
    }
  });
  kick();
});
function endDrag() {
  if (!drag) return;
  const d = drag; drag = null;
  d.el.classList.remove('is-drag');
  if (!d.moved) return;
  d.el._dragged = true; setTimeout(() => { d.el._dragged = false; }, 0);
  const n = d.n, GR = 12;
  n.x = Math.round(n.x / GR) * GR; n.y = Math.round(n.y / GR) * GR;
  n.cx = n.x; n.cy = n.y; place(n);
  G.nodes.forEach(relabel);
  persistirArrasto(d);
  kick();
}
function relabel(n) {
  if (!n.pref || !n.el) return;
  const lbl = n.el.querySelector('.lbl'); if (!lbl) return;
  const roomR = G.W - n.x - 34, roomL = n.x - 34;
  let side = n.pref, mw = n.mw0;
  if (side === 'l' && roomL < 110) side = 'b';
  else if (side === 'r' && roomR < 110) side = 'b';
  else if (side === 'l') mw = Math.min(n.mw0, roomL);
  else if (side === 'r') mw = Math.min(n.mw0, roomR);
  if (side === 'b') { mw = 170; if (n.y > G.H - 110) side = 't'; }
  if (side === 'b' || side === 't') { const lim = 90; if (n.x < lim || n.x > G.W - lim) mw = Math.max(110, Math.min(170, 2 * Math.min(n.x, G.W - n.x) - 20)); }
  lbl.classList.remove('l', 'r', 't', 'b'); lbl.classList.add(side);
  n.el.style.setProperty('--mw', Math.round(mw) + 'px');
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

// grava o que mudou de lugar em relação à mãe: área → mapa-geral.json, ideia/direção → pos no arquivo,
// direção dentro de direção e o arrasto do centro → só neste navegador. Direções reordenadas → ordem.
function persistirArrasto(d) {
  const vk = viewKey();
  const areas = {}, fm = new Map(); // file -> { fm, titulo }
  const subPosAll = ls.get('bs-subpos', {}); const subPos = subPosAll[vk] || {};
  let subMudou = false;
  const quer = (node, campos) => { const f = node.file; const cur = fm.get(f) || { fm: {}, titulo: node.titulo }; Object.assign(cur.fm, campos); fm.set(f, cur); };
  G.nodes.forEach(o => {
    if (o.obras || o.kind === 'ghost') return;
    const s = d.snapshot[o.id];
    const P = o.parent && G.byId[o.parent];
    if (!P) {
      if (o === d.n) { const all = ls.get('bs-pan', {}); const cur = all[vk] || [0, 0]; const du = paraU(o.x - s[0], o.y - s[1]); all[vk] = [cur[0] + du[0], cur[1] + du[1]]; ls.set('bs-pan', all); }
      return;
    }
    const ps = d.snapshot[P.id];
    const r0 = [s[0] - ps[0], s[1] - ps[1]], r1 = [o.x - P.x, o.y - P.y];
    if (Math.abs(r0[0] - r1[0]) < 0.5 && Math.abs(r0[1] - r1[1]) < 0.5) return;
    const u = paraU(r1[0], r1[1]);
    if (o.kind === 'area') areas[o.area] = u;
    else if (o.kind === 'idea' || o.kind === 'dir') { if (!o.ref.provisorio) quer(o.ref, { pos: u }); }
    else if (o.kind === 'sub') { subPos[o.id] = u; subMudou = true; }
  });
  // ordem das direções segue a volta no mapa (a partir do ponto de partida do desenho)
  let reordenou = false;
  const kidsN = G.nodes.filter(o => o.kind === 'dir');
  const c = G.byId.c;
  if (c && kidsN.length > 1 && kidsN.some(o => d.n === o || Math.abs(o.x - d.snapshot[o.id][0]) > 0.5 || Math.abs(o.y - d.snapshot[o.id][1]) > 0.5)) {
    const ang = o => { const a = Math.atan2(o.y - c.y, o.x - c.x) * 180 / Math.PI; return ((a - G.start + G.step / 2) % 360 + 720) % 360; };
    const atual = kidsN.map(o => o.slug);
    const nova = [...kidsN].sort((a, b) => ang(a) - ang(b)).map(o => o.slug);
    if (nova.join() !== atual.join()) {
      reordenou = true;
      nova.forEach((sl, i) => {
        const o = G.byId['d:' + sl]; if (o.ref.provisorio) return;
        const campos = {};
        if (o.ref.ordem !== i + 1) campos.ordem = i + 1;
        // quem não tinha posição guardada fixa onde está, para não pular de lugar com a nova ordem
        if (!o.ref.pos && !(fm.get(o.ref.file) || { fm: {} }).fm.pos) campos.pos = paraU(o.x - c.x, o.y - c.y);
        if (Object.keys(campos).length) quer(o.ref, campos);
      });
    }
  }
  if (subMudou) { subPosAll[vk] = subPos; ls.set('bs-subpos', subPosAll); }
  if (Object.keys(areas).length) store.gravarMapa(areas, 'App: move áreas no mapa geral');
  for (const [file, q] of fm) {
    const msg = 'ordem' in q.fm ? `App: reordena direções (${q.titulo})` : UI.path.length ? `App: move a direção "${q.titulo}" no mapa` : `App: move a ideia "${q.titulo}" no mapa geral`;
    store.remendar(file, { fm: q.fm }, msg);
  }
  if (reordenou) renderPanel(false);
  if (reordenou || fm.size || Object.keys(areas).length) renderMap({ keep: true });
}

function onNodeClick(n) {
  if (busy) return;
  if (n.kind === 'root') { if (UI.hl) { UI.hl = null; applyDim(); renderMapUI(); } return; }
  if (n.kind === 'area') { UI.hl = UI.hl === n.area ? null : n.area; applyDim(); renderMapUI(); return; }
  if (n.kind === 'idea') { navigate([n.ref.key], { dir: 'in', node: n }); return; }
  if (n.kind === 'center') { select(null); return; }
  if (n.kind === 'sub') { navigate([...UI.path, n.owner.slug], { dir: 'in', node: G.byId['d:' + n.owner.slug], sel: n.ref.slug }); return; }
  if (n.kind === 'dir') {
    if (UI.sel === n.slug && n.hasKids) {
      clearTimeout(clickT);
      clickT = setTimeout(() => navigate([...UI.path, n.slug], { dir: 'in', node: n }), 260);
      return;
    }
    select(n.slug);
  }
}

/* ---------------- navegação e mergulho ---------------- */
function navigate(path, opt = {}) {
  if (busy) return;
  if (renaming) renaming.input.blur();
  closeAtalhos();
  const wasIdea = UI.path.length > 0, willIdea = path.length > 0;
  const go = () => {
    UI.path = path; UI.sel = opt.sel != null ? opt.sel : null; UI.hl = null; saveUI(); camReset();
    renderAll({ enter: true, panelIn: !wasIdea && willIdea });
    if (opt.flash && G.byId[opt.flash]) { const el = G.byId[opt.flash].el; el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 1200); }
    busy = false;
  };
  if (RM.matches || !G.world) { go(); return; }
  busy = true;
  const w = G.world;
  if (opt.dir === 'in' && opt.node) {
    w.style.transformOrigin = `${opt.node.cx}px ${opt.node.cy}px`;
    w.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 280, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' }).onfinish = go;
  } else {
    w.style.transformOrigin = '50% 45%';
    const panel = $('#panel');
    if (panel && wasIdea && !willIdea) panel.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: 200, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' });
    w.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.6)', opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' }).onfinish = go;
  }
}
function goUp() {
  if (!UI.path.length) return;
  const p = UI.path.slice(0, -1), last = UI.path[UI.path.length - 1];
  navigate(p, { dir: 'out', sel: p.length ? last : null });
}

/* ---------------- seleção nó <-> aba ---------------- */
function currentKids() { const R = resolve(UI.path); return R ? R.node.direcoes : []; }
function select(slug, opt = {}) {
  const order = [null, ...currentKids().map(d => d.slug)];
  const from = order.indexOf(UI.sel), to = order.indexOf(slug);
  UI.sel = slug; saveUI();
  G.nodes.forEach(n => {
    if (n.kind === 'dir') { const on = n.slug === slug; n.el.classList.toggle('is-sel', on); n.el.setAttribute('aria-pressed', String(on)); }
    if (n.kind === 'center') { n.el.classList.toggle('is-sel', slug == null); n.el.setAttribute('aria-pressed', String(slug == null)); }
  });
  document.querySelectorAll('.tab').forEach(t => { const on = (t.dataset.id || null) === (slug || null); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  renderBody(to < from ? 'slide-l' : 'slide');
  if (opt.fromTab) { const n = slug ? G.byId['d:' + slug] : G.byId.c; if (n) { n.el.classList.remove('pulse'); void n.el.offsetWidth; n.el.classList.add('pulse'); setTimeout(() => n.el.classList.remove('pulse'), 1100); } }
}

/* ---------------- painel ---------------- */
function renderPanel(slideIn) {
  let panel = $('#panel');
  if (!UI.path.length) { if (panel) panel.remove(); mainEl.classList.remove('is-idea'); return; }
  mainEl.classList.add('is-idea');
  if (!panel) { panel = document.createElement('section'); panel.id = 'panel'; panel.className = 'panel'; panel.setAttribute('aria-label', 'Ideia aberta'); mainEl.appendChild(panel); }
  if (slideIn && !RM.matches) { panel.classList.remove('slide-in'); void panel.offsetWidth; panel.classList.add('slide-in'); }
  const R = resolve(UI.path); const { idea, node: center, idx } = R; const col = AREA[idea.area].c;
  const csuf = suffix(idx); const isIdea = UI.path.length === 1;
  const kids = center.direcoes;
  if (UI.sel && !kids.some(d => d.slug === UI.sel)) UI.sel = null;
  const tabs = [`<button class="tab" role="tab" id="tab-c" data-id="" aria-controls="pbody" aria-selected="${!UI.sel}" tabindex="${UI.sel ? -1 : 0}" style="--c:${col}"><span class="bul">${esc(isIdea ? AREA[idea.area].b : csuf)}</span><span class="t">${isIdea ? 'Resumo' : esc(center.titulo)}</span></button>`]
    .concat(kids.map((d, i) => `<button class="tab" role="tab" id="tab-${esc(d.slug)}" data-id="${esc(d.slug)}" aria-controls="pbody" aria-selected="${UI.sel === d.slug}" tabindex="${UI.sel === d.slug ? 0 : -1}" style="--c:${col}" title="${esc(d.titulo)}"><span class="bul">${esc(csuf + seg(idx.length + 1, i))}</span><span class="t">${esc(d.titulo)}</span></button>`));
  panel.innerHTML = `<div class="tabbar"><div class="tabs" role="tablist" aria-label="Direções" id="tabs">${tabs.join('')}</div>
    <button class="addtab" id="btnAddTab" title="Nova direção (N)">${ICON.plus}<span>Direção</span></button></div>
    <div class="pbody" id="pbody" role="tabpanel"><div class="pin" id="pin"></div></div>`;
  const tl = panel.querySelector('#tabs');
  tl.addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t) return; select(t.dataset.id || null, { fromTab: true }); });
  tl.addEventListener('dblclick', e => { const t = e.target.closest('.tab'); if (!t || !t.dataset.id) return; startRename(t.dataset.id); });
  tl.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    const all = [...tl.querySelectorAll('.tab')]; let i = all.findIndex(t => t.getAttribute('aria-selected') === 'true');
    i = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
    e.preventDefault(); select(all[i].dataset.id || null, { fromTab: true }); all[i].focus();
  });
  panel.querySelector('#btnAddTab').addEventListener('click', newDirection);
  renderBody(null);
}

function anexosHTML(lista) {
  if (!lista.length) return '';
  const img = /\.(png|jpe?g|gif|webp|svg)$/i;
  return `<span class="lab">Anexos · ${lista.length}</span><ul class="anexos">${lista.map(a => {
    const ext = (a.nome.split('.').pop() || '').slice(0, 4);
    const th = img.test(a.nome) ? `<img class="th" alt="" data-anexo="${esc(a.path)}">` : `<span class="ext" aria-hidden="true">${esc(ext)}</span>`;
    return `<li><a href="${esc(backend.anexoHref(a.path))}" target="_blank" rel="noopener noreferrer">${th}<span>${esc(a.nome)}</span></a></li>`;
  }).join('')}</ul>`;
}

let lapEditando = null; // arquivo cujo lapidado está aberto em markdown cru
function renderBody(anim) {
  const pin = $('#pin'); if (!pin) return;
  const R = resolve(UI.path); if (!R) return;
  const { idea, node: center, idx } = R; const col = AREA[idea.area].c;
  const csuf = suffix(idx); const isIdea = UI.path.length === 1;
  const kids = center.direcoes;
  const d = UI.sel ? kids.find(k => k.slug === UI.sel) : null;
  const target = d || center;
  const targetIsIdea = !d && isIdea;
  const tcode = d ? csuf + seg(idx.length + 1, kids.indexOf(d)) : csuf;
  const tkids = target.direcoes;
  if (lapEditando && lapEditando !== target.file) lapEditando = null;
  let h = '';
  h += `<h1 class="ph" id="ph">${esc(target.titulo)}</h1>`;
  if (targetIsIdea) {
    h += `<p class="pmeta">${ideaCode(idea) ? `<b>${esc(ideaCode(idea))}</b>` : ''}<span>${esc(areaNome(idea.area))}</span>${idea.criada ? `<span>criada ${fmtData(idea.criada)}</span>` : ''}<span>ativa</span>${idea.pedido ? '<span>pedido ao Claude</span>' : ''}</p>`;
    h += `<div class="actions"><button class="btn btn--sm" data-act="renomear">${ICON.pen}Renomear</button><button class="btn btn--sm" data-act="guardar">${ICON.drawer}Guardar na gaveta</button><button class="btn btn--sm" data-act="decidir" title="A ideia sai do mapa e vai para a página Edição">${ICON.edicao}Decidir → Edição</button></div>`;
  } else {
    h += `<p class="pmeta"><b>${esc(codigoDir(idea, tcode))}</b><span>direção</span>${tkids.length ? `<span>${tkids.length} direções dentro</span>` : ''}${!target.lapidado ? '<span>criada por ti</span>' : ''}</p>`;
    h += `<div class="actions"><button class="btn btn--sm" data-act="renomear">${ICON.pen}Renomear</button>${d && !d.provisorio ? `<button class="btn btn--sm${tkids.length ? ' btn--solid' : ''}" data-act="abrir" title="${tkids.length ? 'Mergulha nesta direção' : 'Mergulha nesta direção para criar direções dentro dela'}">${ICON.dive}Abrir direção</button>` : ''}${!d && !isIdea ? `<button class="btn btn--sm" data-act="voltar">${ICON.back}Voltar um nível</button>` : ''}<button class="btn btn--sm btn--perigo" data-act="apagar" title="Some do mapa na hora; dá para desfazer por alguns segundos">${ICON.trash}Apagar direção</button></div>`;
  }
  // BRUTO
  h += `<section class="layer bruto" aria-labelledby="lb"><header class="layer-h"><b id="lb">Bruto</b><span>teu · intacto</span></header><div class="layer-b">`;
  const fala = idea.fala;
  if (targetIsIdea) {
    h += `<span class="lab">Fala${fala.data ? ' · ' + esc(fmtDataBR(fala.data)) : ''}</span>`;
    h += fala.falas.length ? fala.falas.map(t => `<blockquote class="fala">${linkar(t)}</blockquote>`).join('') : `<p class="empty" style="color:var(--gray)">Sem fala registrada.</p>`;
    if (fala.nota) h += `<div class="fala-nota md">${md(fala.nota, idea.base, backend)}</div>`;
    if (idea.brutoAnexos) h += `<div class="md md-sm" style="margin:0 0 18px">${md(idea.brutoAnexos, idea.base, backend)}</div>`;
  } else if (fala.falas.length) {
    h += `<span class="lab">Fala da ideia</span><blockquote class="fala sm">${linkar(fala.falas[fala.falas.length - 1])}</blockquote>`;
  }
  h += anexosHTML(target.anexos);
  h += `<label class="lab" for="notas">${targetIsIdea ? 'Tuas anotações' : 'Tuas anotações nesta direção'}</label>`;
  h += target.anotacoes.trim()
    ? `<div class="notas-view" id="notasView" role="button" tabindex="0" aria-label="Editar tuas anotações"><div class="md">${md(target.anotacoes, target.base, backend)}</div></div><textarea class="notas" id="notas" hidden placeholder="Escreve aqui. Só tu mexes neste campo.">${esc(target.anotacoes)}</textarea>`
    : `<textarea class="notas" id="notas" placeholder="Escreve aqui. Só tu mexes neste campo. Markdown simples vale.">${esc(target.anotacoes)}</textarea>`;
  h += `</div></section>`;
  // LAPIDADO
  const editando = lapEditando === target.file;
  h += `<section class="layer lap" aria-labelledby="ll"><header class="layer-h"><b id="ll">Lapidado</b><span>do Claude</span><span class="sp"></span>${editando ? '' : `<button class="mini" data-act="editar-lap" aria-label="Editar o lapidado em markdown">editar</button>`}</header><div class="layer-b">`;
  if (editando) {
    h += `<label class="lab" for="lapCru">Markdown do lapidado</label><textarea class="cru" id="lapCru" spellcheck="true">${esc(target.lapidado)}</textarea>
      <div class="cru-bar"><button class="btn btn--sm btn--solid" data-act="fechar-lap">Pronto</button><small>Salva sozinho enquanto escreves. Títulos aqui começam com ###.</small></div>`;
  } else if (target.lapidado) {
    h += `<div class="md">${md(target.lapidado, target.base, backend)}</div>`;
  } else {
    h += `<p class="empty">${targetIsIdea ? 'Ainda sem lapidado. O Claude escreve aqui o resumo e o brainstorm.' : 'Ainda sem lapidado. Tu criaste esta direção; o Claude só escreve aqui quando pedires.'}</p>`;
  }
  if (tkids.length) {
    h += `<span class="lab" style="margin-top:22px">${targetIsIdea ? 'Direções' : 'Direções dentro'} · ${tkids.length}</span><ul class="dlist">`;
    tkids.forEach((k, i) => {
      const kc = !d ? csuf + seg(idx.length + 1, i) : tcode + seg(idx.length + 2, i);
      const m = [k.direcoes.length ? `${k.direcoes.length} dentro` : '', !k.lapidado ? 'nova' : '', k.pedido ? 'pedido' : ''].filter(Boolean).join(' · ');
      h += `<li><button class="drow" data-kid="${esc(k.slug)}" style="--c:${col}"><span class="bul">${esc(kc)}</span><span class="t">${esc(k.titulo)}</span><span class="m">${esc(m)}</span></button></li>`;
    });
    h += `</ul>`;
  }
  if (target.pedido) {
    h += `<div class="dev" style="margin-top:${tkids.length ? 16 : 4}px"><div class="wait" style="--c:${col}" role="status"><strong>Claude desenvolvendo…</strong><p>Leva de 1 a 3 minutos. As direções novas aparecem nesta estação sozinhas; podes continuar mexendo no resto.</p><div class="rail"><div class="runner"></div></div><button class="btn btn--sm" data-act="cancelar">${ICON.x}Cancelar pedido</button></div></div>`;
  } else if (!tkids.length) {
    h += `<div class="dev"><button class="btn btn--solid" data-act="desenvolver">${ICON.branch}Desenvolver</button><small>${targetIsIdea ? 'Pede ao Claude direções para esta ideia.' : 'Pede ao Claude direções novas dentro desta.'} Nada muda até ele responder.</small></div>`;
  }
  h += `</div></section>`;
  pin.innerHTML = h;
  hidratar(pin, backend);
  pin.classList.remove('slide', 'slide-l');
  if (anim && !RM.matches) { void pin.offsetWidth; pin.classList.add(anim); }
  if (anim !== false) $('#pbody').scrollTop = 0;
  $('#pbody').setAttribute('aria-labelledby', d ? 'tab-' + d.slug : 'tab-c');
  bindBody(pin, target, targetIsIdea, d);
}

function bindBody(pin, target, targetIsIdea, d) {
  const file = target.file, titulo = target.titulo;
  // anotações: renderizado fora de foco; textarea que cresce e salva sozinha
  const ta = pin.querySelector('#notas'), view = pin.querySelector('#notasView');
  const cresce = () => { if (!CSS.supports('field-sizing', 'content')) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 4 + 'px'; } };
  const abrirNotas = () => { view.hidden = true; ta.hidden = false; cresce(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); };
  if (view) { view.addEventListener('click', e => { if (e.target.closest('a')) return; abrirNotas(); }); view.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirNotas(); } }); }
  ta.addEventListener('input', () => { cresce(); store.remendar(file, { sec: { 'Bruto/Anotações': rebaixar(ta.value, 4) } }, `App: anotações em "${titulo}"`); });
  ta.addEventListener('blur', () => {
    if (!ta.value.trim()) return;
    let v = view;
    if (!v) { v = document.createElement('div'); v.className = 'notas-view'; v.id = 'notasView'; v.setAttribute('role', 'button'); v.tabIndex = 0; v.setAttribute('aria-label', 'Editar tuas anotações'); ta.before(v);
      v.addEventListener('click', e => { if (e.target.closest('a')) return; v.hidden = true; ta.hidden = false; ta.focus(); });
      v.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); v.hidden = true; ta.hidden = false; ta.focus(); } }); }
    v.innerHTML = `<div class="md">${md(ta.value, target.base, backend)}</div>`; hidratar(v, backend);
    v.hidden = false; ta.hidden = true;
  });
  setTimeout(cresce);
  const cru = pin.querySelector('#lapCru');
  if (cru) cru.addEventListener('input', () => store.remendar(file, { sec: { 'Lapidado': rebaixar(cru.value, 3) } }, `App: edita o lapidado de "${titulo}"`));
  pin.querySelectorAll('[data-kid]').forEach(b => b.addEventListener('click', () => {
    const kid = b.dataset.kid;
    if (!d) select(kid, { fromTab: true });
    else navigate([...UI.path, d.slug], { dir: 'in', node: G.byId['d:' + d.slug], sel: kid });
  }));
  pin.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'renomear') startRename(d ? d.slug : null);
    if (a === 'abrir') navigate([...UI.path, d.slug], { dir: 'in', node: G.byId['d:' + d.slug] });
    if (a === 'voltar') goUp();
    if (a === 'guardar') guardar(target);
    if (a === 'decidir') mudarEstado(target, 'edicao');
    if (a === 'apagar') apagarDirecao(target);
    if (a === 'editar-lap') { lapEditando = file; renderBody(false); const c = $('#lapCru'); if (c) { c.focus(); c.setSelectionRange(0, 0); } }
    if (a === 'fechar-lap') { lapEditando = null; renderBody(false); }
    if (a === 'desenvolver') {
      if (target.provisorio) { toast('Dá um nome à direção antes de pedir ao Claude.'); return; }
      store.remendar(file, { fm: { pedido: 'desenvolver' } }, `App: pede ao Claude para desenvolver "${titulo}"`);
      renderMap({ keep: true }); renderBody(false); toast('Pedido enviado. O Claude está desenvolvendo; em 1 a 3 minutos aparece aqui.');
    }
    if (a === 'cancelar') {
      store.remendar(file, { fm: { pedido: null } }, `App: cancela o pedido de desenvolver "${titulo}"`);
      renderMap({ keep: true }); renderBody(false); toast('Pedido cancelado.');
    }
  }));
}

/* ---------------- renomear (mapa e aba juntos) ---------------- */
let renaming = null;
function startRename(slugDir) {
  if (renaming || busy) return;
  const R = resolve(UI.path); if (!R) return;
  const isCenter = slugDir == null;
  const alvo = isCenter ? R.node : R.node.direcoes.find(k => k.slug === slugDir);
  if (!alvo) return;
  const n = isCenter ? G.byId.c : G.byId['d:' + slugDir];
  if (!n) return;
  if (!isCenter && UI.sel !== slugDir) select(slugDir);
  if (isCenter && UI.sel) select(null);
  const ttl = n.el.querySelector('[data-ttl]'); if (!ttl) return;
  const old = alvo.titulo, file = alvo.file, ehIdeia = alvo.kind === 'ideia', provisorio = !!alvo.provisorio;
  const input = document.createElement('input');
  input.className = 'ren'; input.value = old; input.setAttribute('aria-label', ehIdeia ? 'Novo nome da ideia' : 'Novo nome da direção'); input.maxLength = 80;
  ttl.replaceWith(input);
  renaming = { input };
  input.focus(); input.select();
  const live = v => {
    const name = v.trim() || old;
    const tab = document.querySelector(`.tab[data-id="${CSS.escape(isCenter ? '' : slugDir)}"] .t`); if (tab && !(isCenter && ehIdeia)) tab.textContent = name;
    const ph = $('#ph'); if (ph && ((UI.sel === slugDir) || (isCenter && !UI.sel))) ph.textContent = name;
    const row = document.querySelector(`.drow[data-kid="${CSS.escape(slugDir || '')}"] .t`); if (row) row.textContent = name;
    if (isCenter) renderCrumbs(name);
  };
  input.addEventListener('input', () => live(input.value));
  input.addEventListener('pointerdown', e => e.stopPropagation());
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('dblclick', e => e.stopPropagation());
  const finish = keep => {
    if (!renaming) return; renaming = null;
    const name = keep ? (input.value.replace(/\s+/g, ' ').trim() || old) : old;
    live(name);
    const span = document.createElement('span'); span.className = 'ttl'; span.dataset.ttl = ''; span.textContent = name;
    input.replaceWith(span);
    n.title = name; n.el.setAttribute('aria-label', isCenter ? name : `Direção ${n.code}: ${name}`);
    if (provisorio) { criarDirecao(alvo, name); return; }
    if (name !== old) {
      store.remendar(file, { fm: { titulo: name } }, `App: renomeia ${ehIdeia ? 'ideia' : 'direção'} "${old}" para "${name}"`);
      renderCrumbs();
    }
    n.el.focus({ preventScroll: true });
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    e.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
}

/* ---------------- criar direção ----------------
   A direção nasce na tela na hora; o arquivo só é criado quando o nome é confirmado,
   porque o slug (nome da pasta) nunca muda depois. */
function newDirection() {
  if (!UI.path.length || busy) return;
  if (renaming) renaming.input.blur();
  const R = resolve(UI.path); if (!R) return;
  const mae = R.node;
  const usados = new Set(mae.direcoes.map(k => k.slug));
  let s = 'direcao-nova', k = 2; while (usados.has(s)) s = 'direcao-nova-' + k++;
  const ordem = Math.max(0, ...mae.direcoes.map(x => x.ordem || 0)) + 1;
  const path = `${mae.base}/direcoes/${s}/direcao.md`;
  store.files.set(path, { text: novaDirecao('Direção nova', ordem), remoto: null, sha: null });
  store.reconstruir();
  const novo = M().porBase.get(path.replace(/\/direcao\.md$/, ''));
  if (novo) { novo.provisorio = true; provisorios.add(path); }
  UI.sel = s; saveUI();
  renderPanel(false); renderMap({ keep: true });
  select(s);
  setTimeout(() => startRename(s), RM.matches ? 0 : 260);
}
const provisorios = new Set();
function criarDirecao(alvo, name) {
  const provPath = alvo.file;
  const mae = alvo.mae;
  provisorios.delete(provPath);
  store.files.delete(provPath);
  const usados = new Set(mae.direcoes.filter(k => k.file !== provPath).map(k => k.slug));
  let base = fazerSlug(name), s = base, k = 2;
  while (usados.has(s)) s = `${base}-${k++}`;
  const path = `${mae.base}/direcoes/${s}/direcao.md`;
  store.criar(path, novaDirecao(name, alvo.ordem || mae.direcoes.length), `App: cria a direção "${name}" em "${mae.titulo}"`);
  if (UI.sel === alvo.slug) { UI.sel = s; saveUI(); }
  renderPanel(false); renderMap({ keep: true });
  const n = G.byId['d:' + s]; if (n) n.el.focus({ preventScroll: true });
}
// depois de cada reconstrução, as direções ainda sem arquivo continuam marcadas
function remarcarProvisorios() {
  for (const p of provisorios) { const n = M().porBase.get(p.replace(/\/direcao\.md$/, '')); if (n) n.provisorio = true; else provisorios.delete(p); }
}

/* ---------------- gaveta ---------------- */
const sheet = $('#sheet'), scrim = $('#scrim');
let lastFocus = null;
const guardadas = () => M().ideias.filter(i => i.estado === 'guardada');
function renderGaveta() {
  const list = guardadas();
  $('#gvCount').textContent = list.length;
  $('#sheetSub').textContent = list.length ? `${list.length} ${list.length > 1 ? 'ideias guardadas' : 'ideia guardada'} · fora do mapa` : 'nada guardado';
  const b = $('#sheetB');
  if (!list.length) { b.innerHTML = `<p class="gv-empty">Gaveta vazia. Ideia guardada sai do mapa e espera aqui até voltar.</p>`; return; }
  b.innerHTML = list.map(i => {
    const a = AREA[i.area];
    return `<article class="gv"><div class="gv-top"><span class="bul" style="--c:${a.c}">${a.b}</span><span class="pmeta" style="margin:0">${ideaCode(i) ? `<b>${esc(ideaCode(i))}</b>` : ''}<span>${esc(a.nome)}</span>${i.criada ? `<span>criada ${fmtData(i.criada)}</span>` : ''}</span></div>
      <h3>${esc(i.titulo)}</h3>${i.resumo ? `<p class="res"><mark>lapidado</mark>${esc(i.resumo.replace(/\s+/g, ' '))}</p>` : ''}
      <button class="btn btn--sm btn--solid" data-reativar="${esc(i.key)}">${ICON.back}Reativar</button></article>`;
  }).join('');
  b.querySelectorAll('[data-reativar]').forEach(btn => btn.addEventListener('click', () => reativar(btn.dataset.reativar)));
}
function openGaveta() { closeAtalhos(); lastFocus = document.activeElement; renderGaveta(); sheet.hidden = false; scrim.hidden = false; $('#btnFechaGaveta').focus(); }
function closeGaveta() { if (sheet.hidden) return; sheet.hidden = true; scrim.hidden = true; if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
function reativar(key) {
  const i = ideiaPorKey(key); if (!i) return;
  store.remendar(i.file, { fm: { estado: 'ativa' } }, `App: reativa a ideia "${i.titulo}"`);
  renderGaveta(); closeGaveta();
  toast(`Reativada: volta na linha ${areaNome(i.area)}.`);
  if (UI.path.length) navigate([], { dir: 'out', flash: 'i:' + key });
  else { renderMap({ keep: true }); renderMapUI(); const n = G.byId['i:' + key]; if (n) { n.el.classList.add('pulse'); setTimeout(() => n.el.classList.remove('pulse'), 1200); } }
}
function guardar(idea) {
  store.remendar(idea.file, { fm: { estado: 'guardada' } }, `App: guarda a ideia "${idea.titulo}" na gaveta`);
  renderGaveta();
  toast('Guardada na gaveta. Sai do mapa até tu reativares.');
  navigate([], { dir: 'out' });
}
$('#btnGaveta').addEventListener('click', openGaveta);
$('#btnFechaGaveta').addEventListener('click', closeGaveta);
scrim.addEventListener('click', closeGaveta);

/* ---------------- etapas: Brainstorm → Edição → Kanban ---------------- */
const etapaEl = $('#etapa');
const etapas = criarEtapas({
  UI, saveUI, store: () => store, backend: () => backend, esc, ICON, toast, linkar, fmtData, fmtDataBR, rebaixar, plural, areaNome,
  irPara: (e, k) => irPara(e, k), mudarEstado: (i, e) => mudarEstado(i, e), apagarDirecao: d => apagarDirecao(d), renderNav: () => renderNav()
});
function renderNav() {
  if (!store || !store.rev) { document.querySelectorAll('.et').forEach(b => { b.classList.toggle('is-on', b.dataset.etapa === UI.etapa); b.querySelector('.et-c').textContent = ''; }); return; }
  const conta = { brainstorm: M().ideias.filter(i => i.estado === 'ativa').length, edicao: etapas.contar('edicao'), kanban: etapas.contar('kanban') };
  document.querySelectorAll('.et').forEach(b => {
    const e = b.dataset.etapa, on = e === UI.etapa;
    b.classList.toggle('is-on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    $('#etC-' + e).textContent = conta[e];
    b.setAttribute('aria-label', `${nomeEtapa(e)}: ${conta[e]}`);
  });
}
function irPara(etapa, key) {
  if (!store || busy) return;
  if (renaming) renaming.input.blur();
  closeAtalhos(); closeGaveta();
  if (etapa === 'edicao' && key) UI.ed = key;
  if (etapa === 'kanban' && key) UI.kb = key;
  const mudou = UI.etapa !== etapa;
  UI.etapa = etapa; if (mudou) etapas.soltar(); saveUI();
  renderAll({ enter: mudou && etapa === 'brainstorm', panelIn: mudou && etapa === 'brainstorm' && UI.path.length > 0 });
}
document.querySelectorAll('.et').forEach(b => b.addEventListener('click', () => irPara(b.dataset.etapa)));
renderNav();
function flash(id) { const n = G.byId[id]; if (n && n.el) { n.el.classList.add('pulse'); setTimeout(() => n.el.classList.remove('pulse'), 1200); } }

// troca de etapa de uma ideia: só a linha "estado" do arquivo muda
function mudarEstado(idea, estado) {
  const de = idea.estado, key = idea.key, t = idea.titulo;
  const msg = estado === 'ativa' ? `App: volta a ideia "${t}" para o Brainstorm`
    : estado === 'edicao' ? (de === 'ativa' ? `App: manda a ideia "${t}" para a Edição` : `App: volta "${t}" para a Edição`)
    : estado === 'kanban' ? (de === 'feita' ? `App: reabre "${t}" no Kanban` : `App: manda "${t}" para o Kanban`)
    : `App: conclui a ideia "${t}"`;
  store.remendar(idea.file, { fm: { estado } }, msg);
  if (estado === 'edicao' && de === 'ativa') {
    UI.ed = key; saveUI(); renderNav();
    toast(`Foi para a Edição: “${t}”.`, { acao: 'Abrir a Edição', fn: () => irPara('edicao', key) });
    if (UI.etapa === 'brainstorm') navigate([], { dir: 'out' }); else renderAll();
    return;
  }
  if (estado === 'ativa') {
    UI.path = []; UI.sel = null; saveUI(); renderAll();
    toast('Voltou ao Brainstorm.', { acao: 'Ver no mapa', fn: () => { irPara('brainstorm'); setTimeout(() => flash('i:' + key), RM.matches ? 0 : 700); } });
    return;
  }
  if (estado === 'kanban' && de === 'edicao') { irPara('kanban', key); toast(`No Kanban: ${plural(totalTarefas(idea.plano), 'tarefa', 'tarefas')} em A fazer.`); return; }
  if (estado === 'edicao') { irPara('edicao', key); toast('Voltou para a Edição.'); return; }
  renderAll();
  toast(estado === 'feita' ? 'Concluída. Fica em “Concluídas”, no Kanban.' : 'Reaberta no Kanban.');
}

/* ---------------- apagar direção: some na hora, "Desfazer" por alguns segundos, depois vai para o GitHub ---------------- */
const DESFAZER_MS = 8000;
let adiado = null;
function efetivarAdiado() { if (!adiado) return; const a = adiado; adiado = null; clearTimeout(a.timer); a.fazer(); }
function contarDentro(n) { let d = 0, x = n.anexos.length; const walk = k => k.direcoes.forEach(c => { d++; x += c.anexos.length; walk(c); }); walk(n); return { d, x }; }
function apagarDirecao(dir) {
  if (!dir || dir.kind !== 'direcao' || busy) return;
  if (renaming) renaming.input.blur();
  if (dir.provisorio) { provisorios.delete(dir.file); store.files.delete(dir.file); store.reconstruir(); if (UI.sel === dir.slug) UI.sel = null; saveUI(); renderAll({ keep: true }); return; }
  efetivarAdiado();
  const base = dir.base, titulo = dir.titulo;
  const { d, x } = contarDentro(dir);
  const extra = [d ? plural(d, 'direção dentro', 'direções dentro') : '', x ? plural(x, 'anexo', 'anexos') : ''].filter(Boolean).join(' e ');
  // se a direção está aberta (ou contém a aberta), a tela sobe para a mãe dela
  const antes = { path: UI.path.slice(), sel: UI.sel };
  let subiu = false;
  const R = UI.etapa === 'brainstorm' ? resolve(UI.path) : null;
  if (R) {
    const k = R.chain.indexOf(dir);
    if (k > 0) { UI.path = UI.path.slice(0, k); UI.sel = null; subiu = true; }
    else if (UI.sel === dir.slug) UI.sel = null;
  }
  saveUI();
  store.ocultar(base);
  renderAll(subiu ? { enter: true } : { keep: true });
  const msg = `App: apaga a direção "${titulo}"${extra ? ` (com ${extra})` : ''}`;
  const a = { base, fazer: () => { store.apagarPasta(base, msg); renderNav(); } };
  a.timer = setTimeout(() => { if (adiado === a) { adiado = null; a.fazer(); } }, DESFAZER_MS);
  adiado = a;
  toast(`Apagada: “${titulo}”${extra ? `, com ${extra}` : ''}.`, { acao: 'Desfazer', ms: DESFAZER_MS, fn: () => {
    if (adiado !== a) return;
    adiado = null; clearTimeout(a.timer);
    store.mostrar(base);
    if (UI.etapa === 'brainstorm') { UI.path = antes.path; UI.sel = antes.sel; saveUI(); }
    renderAll(subiu ? { enter: true } : { keep: true });
    toast('Voltou.');
  } });
}

/* ---------------- atalhos ---------------- */
const at = $('#atalhos'), btnAt = $('#btnAtalhos');
$('#atalhosList').innerHTML = CONFIG.atalhos.map(a => `<li><button class="at" data-onde="${esc(a.onde)}"><b>${esc(a.nome)}</b><span>${esc(a.onde)}</span><i>copiar</i></button></li>`).join('');
at.querySelectorAll('.at').forEach(b => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.onde); b.classList.add('ok'); b.querySelector('i').textContent = 'copiado'; }
  catch (e) { b.querySelector('i').textContent = 'sem acesso'; }
  setTimeout(() => { b.classList.remove('ok'); b.querySelector('i').textContent = 'copiar'; }, 1400);
}));
function closeAtalhos() { if (at.hidden) return; at.hidden = true; btnAt.setAttribute('aria-expanded', 'false'); }
btnAt.addEventListener('click', () => { const open = at.hidden; at.hidden = !open; btnAt.setAttribute('aria-expanded', String(open)); });
$('#btnSair').addEventListener('click', () => {
  if (LOCAL) {
    if (!confirm('Descartar as mudanças feitas neste navegador e voltar aos arquivos?')) return;
    backend.descartar(); location.reload(); return;
  }
  if (store && store.ocupado && !confirm('Ainda há mudanças salvando. Sair mesmo assim?')) return;
  tokenDel(); ls.del('bs-cache'); location.reload();
});

/* ---------------- topo, interface do mapa ---------------- */
function renderCrumbs(liveName) {
  const ol = $('#crumbs'); const items = [{ t: 'BRAINSTORM', p: [] }];
  if (UI.etapa !== 'brainstorm') {
    const i = etapas.ideiaAberta();
    const its = [{ t: 'BRAINSTORM', fn: () => irPara('brainstorm') }, { t: i ? i.titulo : nomeEtapa(UI.etapa) }];
    ol.innerHTML = its.map((it, k) => {
      const last = k === its.length - 1, cls = `crumb${k === 0 ? ' home' : ''}`;
      return `<li>${last ? `<span class="${cls}" aria-current="page" title="${esc(it.t)}">${esc(it.t)}</span>` : it.fn ? `<button class="${cls}" data-k="${k}" title="Voltar ao mapa do Brainstorm">${esc(it.t)}</button>` : `<span class="${cls}">${esc(it.t)}</span>`}</li>`;
    }).join('');
    ol.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => { UI.path = []; UI.sel = null; its[+b.dataset.k].fn(); }));
    return;
  }
  const R = resolve(UI.path);
  if (R) R.chain.forEach((c, k) => items.push({ t: (k === R.chain.length - 1 && liveName) ? liveName : c.titulo, p: UI.path.slice(0, k + 1) }));
  ol.innerHTML = items.map((it, k) => {
    const last = k === items.length - 1;
    return `<li>${last ? `<span class="crumb${k === 0 ? ' home' : ''}" aria-current="page" title="${esc(it.t)}">${esc(it.t)}</span>` : `<button class="crumb${k === 0 ? ' home' : ''}" data-k="${k}" title="${esc(it.t)}">${esc(it.t)}</button>`}</li>`;
  }).join('');
  ol.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => {
    const k = +b.dataset.k; const p = items[k].p; navigate(p, { dir: 'out', sel: p.length ? UI.path[p.length] : null });
  }));
}
function renderMapUI() {
  mapEl.querySelectorAll('.dyn').forEach(e => e.remove());
  const ui = document.createElement('div');
  if (!UI.path.length) {
    const ativas = M().ideias.filter(i => i.estado === 'ativa').length, g = guardadas().length;
    const hl = UI.hl ? ` · linha ${areaNome(UI.hl)} em destaque` : '';
    ui.innerHTML = `<div class="cartouche dyn"><h1>Mapa geral</h1><p>${plural(ativas, 'ideia ativa', 'ideias ativas')} · ${g} na gaveta${hl}</p></div>
      <div class="map-ui map-tr dyn hint"><span>arraste para mover</span><span class="h-opt">pinça dá zoom</span><span class="h-opt">clique na área destaca a linha</span><span>clique na estação abre a ideia</span></div>`;
  } else {
    ui.innerHTML = `<div class="map-ui map-tr dyn"><button class="btn btn--sm" id="btnNova">${ICON.plus}Nova direção <span class="kbd">N</span></button></div>
      <div class="map-ui map-br dyn hint"><span>arraste para mover</span><span class="h-opt">pinça dá zoom</span><span class="h-opt">duplo clique ou F2 renomeia</span><span>Esc volta um nível</span></div>`;
  }
  [...ui.children].forEach(c => mapEl.appendChild(c));
  const bn = $('#btnNova'); if (bn) bn.addEventListener('click', newDirection);
}
function renderAll(opt = {}) {
  renderNav();
  const emEtapa = UI.etapa !== 'brainstorm';
  mainEl.classList.toggle('is-etapa', emEtapa);
  etapaEl.hidden = !emEtapa;
  if (emEtapa) { renderCrumbs(); renderGaveta(); etapas.render(); return; }
  if (UI.path.length && !resolve(UI.path)) { UI.path = []; UI.sel = null; saveUI(); }
  renderCrumbs(); renderGaveta();
  renderPanel(opt.panelIn);
  renderMap({ enter: opt.enter, keep: opt.keep });
}

/* ---------------- sincronia: indicador ---------------- */
const syncBtn = $('#sync'), syncL = $('#syncL');
const ROT = { salvo: 'salvo', salvando: 'salvando', offline: 'sem conexão', erro: 'erro', buscando: 'buscando' };
function renderStatus(s) {
  s = s || store.status;
  syncBtn.dataset.s = s; syncL.textContent = ROT[s] || s;
  const dica = s === 'erro' ? `${store.erro ? store.erro.message : 'Erro ao salvar.'} Clica para tentar de novo.`
    : s === 'offline' ? 'Sem conexão. As mudanças ficam guardadas aqui e sobem quando a internet voltar. Clica para tentar agora.'
    : s === 'salvando' ? 'Salvando as mudanças no GitHub.'
    : s === 'buscando' ? 'Buscando mudanças do Claude.'
    : (LOCAL ? 'Modo local: salvo só neste navegador. Clica para buscar mudanças dos arquivos.' : 'Tudo salvo no GitHub. Clica para buscar mudanças do Claude.');
  syncBtn.title = dica; syncBtn.setAttribute('aria-label', `Sincronia: ${ROT[s] || s}. ${dica}`);
}
syncBtn.addEventListener('click', async () => {
  if (!store) return;
  if (store.status === 'erro' && store.erro && store.erro.tipo === 'auth') { pedirChave('A chave guardada foi recusada pelo GitHub. Cola uma chave nova.'); return; }
  if (store.status === 'erro' || store.status === 'offline') { store.agora(); return; }
  if (store.ocupado) return;
  await buscarRemoto(true);
});
let ultimaBusca = Date.now();
const editando = () => !!renaming || !!drag || busy || etapas.ocupado() || (document.activeElement && document.activeElement.matches && document.activeElement.matches('textarea, input'));
async function buscarRemoto(manual) {
  if (!store || store.ocupado || editando()) return;
  ultimaBusca = Date.now();
  if (manual) renderStatus('buscando');
  try {
    const mudou = await store.atualizar();
    if (mudou) { remarcarProvisorios(); const sc = $('#pbody') ? $('#pbody').scrollTop : 0; renderAll({ keep: true }); if ($('#pbody')) $('#pbody').scrollTop = sc; if (manual) toast('Atualizado com as mudanças do Claude.'); }
    else if (manual) toast('Nada novo no GitHub.');
  } catch (e) { if (manual) toast(e.message || 'Não deu para buscar agora.'); }
  renderStatus();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - ultimaBusca > 30000) buscarRemoto(false); });
const haPedido = () => !!store && !store.pend.size && M().ideias.some(temPedido);
setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - ultimaBusca > (haPedido() ? 20000 : 120000)) buscarRemoto(false); }, 10000);
window.addEventListener('online', () => { if (store && store.pend.size) store.agora(); });
window.addEventListener('beforeunload', e => { efetivarAdiado(); if (store && store.ocupado) { e.preventDefault(); e.returnValue = ''; } });

/* ---------------- teclado ---------------- */
document.addEventListener('keydown', e => {
  if (!store || !$('#entrada').hidden) return;
  const typing = e.target.closest && e.target.closest('input, textarea, [contenteditable]');
  if (e.key === 'Escape') {
    if (renaming) return;
    if (!sheet.hidden) { closeGaveta(); return; }
    if (!at.hidden) { closeAtalhos(); btnAt.focus(); return; }
    if (typing) { e.target.blur(); return; }
    if (UI.etapa !== 'brainstorm') return;
    if (UI.path.length) { goUp(); return; }
    if (UI.hl) { UI.hl = null; applyDim(); renderMapUI(); }
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const etapaTecla = { 1: 'brainstorm', 2: 'edicao', 3: 'kanban' }[e.key];
  if (etapaTecla && !e.repeat) { if (!e.target.closest('.board')) { e.preventDefault(); irPara(etapaTecla); } return; }
  if (e.key === 'g' || e.key === 'G') { if (!e.repeat) { e.preventDefault(); if (sheet.hidden) openGaveta(); else closeGaveta(); } return; }
  if (UI.etapa !== 'brainstorm') return;
  if ((e.key === 'n' || e.key === 'N') && UI.path.length && sheet.hidden) { e.preventDefault(); newDirection(); }
  else if (e.key === 'F2' && UI.path.length && sheet.hidden) { e.preventDefault(); startRename(UI.sel || null); }
  else if (!typing && !e.metaKey && !e.ctrlKey && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomCentro(1.25); }
  else if (!typing && !e.metaKey && !e.ctrlKey && (e.key === '-' || e.key === '_')) { e.preventDefault(); zoomCentro(0.8); }
  else if (!typing && !e.metaKey && !e.ctrlKey && e.key === '0') { e.preventDefault(); camReset(); }
});
sheet.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const f = [...sheet.querySelectorAll('button, a[href]')]; if (!f.length) return;
  const a = f[0], z = f[f.length - 1];
  if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
});
document.addEventListener('pointerdown', e => { if (!at.hidden && !e.target.closest('#atalhos, #btnAtalhos')) closeAtalhos(); });

/* ---------------- toast, resize ---------------- */
let toastT = 0;
// toast(msg) ou toast(msg, { acao: 'Desfazer', fn, ms }): o botão some junto com o aviso
function toast(msg, opt = {}) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status');
  const sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);
  if (opt.acao) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-b'; b.textContent = opt.acao;
    b.addEventListener('click', () => { t.remove(); opt.fn(); });
    t.appendChild(b);
  }
  document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), opt.ms || (opt.acao ? 6000 : 2800));
}
let rzT = 0;
const onResize = () => { clearTimeout(rzT); rzT = setTimeout(() => {
  if (!store || busy || renaming || drag || UI.etapa !== 'brainstorm') return;
  const r = mapEl.getBoundingClientRect();
  if (Math.abs(r.width - G.W) > 1 || Math.abs(r.height - G.H) > 1) renderMap({});
}, 100); };
if (window.ResizeObserver) new ResizeObserver(onResize).observe(mapEl); else window.addEventListener('resize', onResize);
const hoje = new Date(); $('#hoje').textContent = `${hoje.getDate()} ${MESES[hoje.getMonth()]} ${hoje.getFullYear()}`;

/* ---------------- estados: carregando, erro, entrada ---------------- */
function estado(tipo, titulo, texto, botao) {
  const el = $('#estado'), inn = $('#estadoIn');
  if (!tipo) { el.hidden = true; return; }
  el.hidden = false; el.classList.toggle('is-erro', tipo === 'erro');
  inn.innerHTML = `<div class="rail" style="--c:var(--ink)"><div class="runner"></div></div><h2>${esc(titulo)}</h2><p>${esc(texto)}</p>${botao ? `<button class="btn btn--solid" id="estadoBtn">${esc(botao.t)}</button>` : ''}`;
  if (botao) $('#estadoBtn').addEventListener('click', botao.fn);
}
function pedirChave(msg) {
  const ent = $('#entrada'); ent.hidden = false;
  $('#entradaErro').innerHTML = msg ? `<p class="msg-erro">${esc(msg)}</p>` : '';
  setTimeout(() => $('#token').focus(), 30);
}
$('#formEntrada').addEventListener('submit', async e => {
  e.preventDefault();
  const t = $('#token').value.trim();
  const btn = $('#btnEntrar'), err = $('#entradaErro');
  if (!t) return;
  btn.disabled = true; btn.textContent = 'Testando a chave…'; err.innerHTML = '';
  const b = new GitHubBackend({ owner: CONFIG.owner, repo: CONFIG.repo, branch: CONFIG.branch, token: t });
  try {
    await b.testar();
    tokenSet(t); $('#token').value = '';
    $('#entrada').hidden = true;
    iniciar(b);
  } catch (ex) {
    err.innerHTML = `<p class="msg-erro"><b>Não entrou.</b> ${esc(ex.message || 'Erro desconhecido.')}</p>`;
  } finally { btn.disabled = false; btn.textContent = 'Testar e entrar'; }
});

async function iniciar(b) {
  backend = b;
  store = new Store(backend);
  store.on((tipo, path) => {
    if (tipo === 'status') renderStatus();
    if (tipo === 'remoto-arquivo') { remarcarProvisorios(); if (!editando()) { const sc = $('#pbody') ? $('#pbody').scrollTop : 0; renderAll({ keep: true }); if ($('#pbody')) $('#pbody').scrollTop = sc; } }
  });
  // a cada reconstrução (mudança local), as direções sem arquivo continuam marcadas
  const rec = store.reconstruir.bind(store);
  store.reconstruir = () => { rec(); remarcarProvisorios(); };
  $('#tagLocal').hidden = !LOCAL;
  $('#btnSair').textContent = LOCAL ? 'Descartar edições locais' : 'Sair (esquecer a chave neste navegador)';
  renderStatus('salvo');
  estado('carregando', 'Carregando as ideias', LOCAL ? 'Lendo os arquivos da pasta BRAINSTORM.' : 'Lendo o repositório brainstorm no GitHub.');
  try {
    await store.carregar();
  } catch (e) {
    if (e.tipo === 'auth') { tokenDel(); estado(null); store = null; pedirChave('A chave guardada não vale mais (vencida ou apagada). Cria outra e cola aqui.'); return; }
    if (e.tipo === 'naoexiste') { estado('erro', 'Repositório não encontrado', `A chave não enxerga ${CONFIG.owner}/${CONFIG.repo} (ramo ${CONFIG.branch}). Confere o acesso da chave.`, { t: 'Trocar a chave', fn: () => { tokenDel(); location.reload(); } }); return; }
    estado('erro', e.tipo === 'rede' ? 'Sem conexão' : 'Não deu para carregar', e.message || 'Erro desconhecido.', { t: 'Tentar de novo', fn: () => iniciar(backend) });
    return;
  }
  estado(null);
  if (store.truncado) toast('O repositório ficou grande demais para ler de uma vez; algumas ideias podem faltar.');
  if (store.model.erros.length) toast(`${plural(store.model.erros.length, 'arquivo ignorado', 'arquivos ignorados')}: fora do formato.`);
  renderAll({ enter: true, panelIn: UI.path.length > 0 });
}

/* ---------------- início ---------------- */
if (LOCAL) iniciar(new LocalBackend({ base: params.get('dados') || './dados/' }));
else {
  const t = tokenGet();
  if (t) iniciar(new GitHubBackend({ owner: CONFIG.owner, repo: CONFIG.repo, branch: CONFIG.branch, token: t }));
  else pedirChave('');
}
