// Árvore de uma ideia num mapa só: endereço das direções (rel), o que está aberto, desenho radial e migração
// do estado antigo (quando cada direção com galhos abria outra página). Funções puras, testadas em testes/arvore.

// rel = slugs da direção a partir da ideia, separados por "/" ("tres-opcoes/um-erro"). A ideia é ''.
export function relDe(n) { const s = []; while (n && n.kind === 'direcao') { s.unshift(n.slug); n = n.mae; } return s.join('/'); }
export function ideiaDe(n) { while (n && n.kind === 'direcao') n = n.mae; return n || null; }
export function noPorRel(raiz, rel) {
  if (!rel) return raiz;
  let n = raiz;
  for (const s of rel.split('/')) { n = (n.direcoes || []).find(d => d.slug === s); if (!n) return null; }
  return n;
}
export const maeRel = rel => (rel && rel.includes('/')) ? rel.slice(0, rel.lastIndexOf('/')) : null;
export const topoRel = rel => rel ? rel.split('/')[0] : null;
export const nivelRel = rel => rel ? rel.split('/').length : 0;
export function ancestraisRel(rel) { const p = String(rel || '').split('/').filter(Boolean); return p.slice(0, -1).map((_, i) => p.slice(0, i + 1).join('/')); }
// índices de cada passo do caminho (para os códigos B, B1, B1a...)
export function indicesRel(raiz, rel) {
  const out = []; let n = raiz;
  if (!rel) return out;
  for (const s of rel.split('/')) { const i = n.direcoes.findIndex(d => d.slug === s); if (i < 0) return null; out.push(i); n = n.direcoes[i]; }
  return out;
}

// aberto por padrão: as direções do primeiro anel que têm galhos (mostra as direções e um nível abaixo)
export function abertosPadrao(raiz) { return raiz.direcoes.filter(d => d.direcoes.length).map(d => d.slug); }
export function todosComGalhos(raiz) {
  const out = [];
  const walk = (n, rel) => n.direcoes.forEach(d => { const r = rel ? rel + '/' + d.slug : d.slug; if (d.direcoes.length) { out.push(r); walk(d, r); } });
  walk(raiz, ''); return out;
}
// fechar um galho fecha também os de dentro
export function fecharRel(set, rel) { for (const r of [...set]) if (r === rel || r.startsWith(rel + '/')) set.delete(r); return set; }
// ordem de leitura (em profundidade) das direções visíveis
export function visiveisRel(raiz, aberto) {
  const out = [];
  const walk = (n, rel, prof) => n.direcoes.forEach(d => { const r = rel ? rel + '/' + d.slug : d.slug; out.push(r); if (aberto.has(r)) walk(d, r, prof + 1); });
  walk(raiz, '', 1); return out;
}

/* ---------------- desenho radial ----------------
   Primeiro anel: fatias iguais, raio fixo, a primeira direção em cima. Não depende do que está aberto,
   então nunca se mexe quando um galho abre ou fecha. Do segundo nível para fora, cada galho recebe uma fatia
   proporcional às folhas visíveis, os filhos saem para fora (anéis concêntricos) e, em cada anel, as bolinhas
   são afastadas até os nomes não se sobreporem (o espaço exigido depende do ângulo: nas laterais os nomes
   ficam empilhados e basta a altura; em cima e embaixo, ficam lado a lado e é preciso a largura).
   Devolve posições relativas ao centro da ideia: Map rel -> { x, y, a, nivel }. */
export const ALTURA_NOME = 36;   // altura de um nome de galho (até duas linhas) + folga
export const MIN_BOLINHA = 26;   // distância mínima entre duas bolinhas vizinhas
export const largNome = t => Math.min(150, String(t || '').length * 6.8) + 18; // bolinha + espaço + texto, estimado

function espacoPx(a, larg) {
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const porAltura = c > 1e-3 ? ALTURA_NOME / c : Infinity;
  const porLargura = s > 1e-3 ? (larg + 8) / s : Infinity;
  // folga de 12%: a conta usa o ângulo do meio, e a corda entre duas bolinhas é um pouco menor que o arco
  return Math.max(MIN_BOLINHA, Math.min(porAltura, porLargura) * 1.12);
}

export function desenharArvore(raiz, aberto, opt = {}) {
  const R1 = opt.R1 || 220, PASSO = opt.passo || 185, POR_FOLHA = opt.porFolha || 46;
  const larg = opt.larg || (n => largNome(n.titulo));
  const pos = new Map();
  const kids1 = raiz.direcoes, n1 = kids1.length;
  if (!n1) return { pos, raios: [0, R1], inicio: -90, passo: 360 };
  const vis = (n, rel) => aberto.has(rel) ? n.direcoes : [];
  const memo = new Map();
  const folhas = (n, rel) => {
    if (memo.has(rel)) return memo.get(rel);
    const k = vis(n, rel);
    const v = k.length ? k.reduce((s, c) => s + folhas(c, rel + '/' + c.slug), 0) : 1;
    memo.set(rel, v); return v;
  };
  const raioBase = d => R1 + (d - 1) * PASSO;
  const aneis = [];
  const reparte = (n, rel, a0, a1, d) => {
    const k = vis(n, rel); if (!k.length) return;
    const pesos = k.map(c => folhas(c, rel + '/' + c.slug)), tot = pesos.reduce((s, x) => s + x, 0);
    let a = a0;
    k.forEach((c, i) => {
      const w = (a1 - a0) * pesos[i] / tot, mid = a + w / 2, r = rel + '/' + c.slug;
      (aneis[d] = aneis[d] || []).push({ rel: r, n: c, quer: mid });
      // os filhos ganham uma fatia um pouco mais larga que a do pai, se precisarem
      const abre = Math.min(Math.PI * 1.1, Math.max(w, folhas(c, r) * POR_FOLHA / raioBase(d + 1)));
      reparte(c, r, mid - abre / 2, mid + abre / 2, d + 1);
      a += w;
    });
  };
  const step = 2 * Math.PI / n1, ini = -Math.PI / 2;
  kids1.forEach((c, i) => {
    const a = ini + i * step;
    pos.set(c.slug, { x: R1 * Math.cos(a), y: R1 * Math.sin(a), a, nivel: 1 });
    const abre = Math.min(Math.PI * 1.1, Math.max(step, folhas(c, c.slug) * POR_FOLHA / raioBase(2)));
    reparte(c, c.slug, a - abre / 2, a + abre / 2, 2);
  });
  const raios = [0, R1];
  for (let d = 2; d < aneis.length; d++) {
    const anel = aneis[d] || [];
    let R = Math.max(raioBase(d), raios[d - 1] + PASSO);
    if (!anel.length) { raios[d] = R; continue; }
    const angs = espalhar(anel.map(o => ({ quer: o.quer, larg: larg(o.n) })), R, r => { R = r; });
    raios[d] = R;
    anel.forEach((o, i) => pos.set(o.rel, { x: R * Math.cos(angs[i]), y: R * Math.sin(angs[i]), a: angs[i], nivel: d }));
  }
  return { pos, raios, inicio: -90, passo: 360 / n1 };
}

// afasta as bolinhas de um anel o mínimo possível (blocos que se encostam andam juntos, centrados no desejado)
function espalhar(itens, R0, novoRaio) {
  const n = itens.length;
  const ord = itens.map((o, i) => i).sort((i, j) => itens[i].quer - itens[j].quer);
  if (n === 1) return [itens[0].quer];
  // corta o círculo no maior vão, para tratar como uma linha
  const TAU = 2 * Math.PI;
  let corte = 0, maior = -1;
  for (let k = 0; k < n; k++) {
    const a = itens[ord[k]].quer, b = k + 1 < n ? itens[ord[k + 1]].quer : itens[ord[0]].quer + TAU;
    if (b - a > maior) { maior = b - a; corte = k + 1; }
  }
  const seq = [];
  for (let k = 0; k < n; k++) {
    const i = ord[(corte + k) % n];
    let q = itens[i].quer;
    if (seq.length && q < seq[seq.length - 1].q) q += TAU * Math.ceil((seq[seq.length - 1].q - q) / TAU);
    seq.push({ i, q });
  }
  // vão exigido entre vizinhos, em px (depende do ângulo e da largura dos nomes)
  const px = seq.map((s, k) => k ? espacoPx((seq[k - 1].q + s.q) / 2, Math.max(itens[seq[k - 1].i].larg, itens[s.i].larg)) : 0);
  const totalPx = px.reduce((a, b) => a + b, 0);
  let R = R0;
  if (totalPx / R > TAU * 0.92) { R = totalPx / (TAU * 0.92); novoRaio(R); }
  const gap = px.map(p => p / R);
  // blocos: { ini, offs[], ks[] }
  const blocos = [];
  seq.forEach((s, k) => {
    let b = { ks: [k], offs: [0], ini: s.q };
    while (blocos.length) {
      const p = blocos[blocos.length - 1];
      const fimP = p.ini + p.offs[p.offs.length - 1];
      if (fimP + gap[b.ks[0]] <= b.ini + 1e-9) break;
      blocos.pop();
      const base = p.offs[p.offs.length - 1] + gap[b.ks[0]];
      const ks = p.ks.concat(b.ks), offs = p.offs.concat(b.offs.map(o => o + base));
      const ini = ks.reduce((acc, kk, j) => acc + seq[kk].q - offs[j], 0) / ks.length;
      b = { ks, offs, ini };
    }
    blocos.push(b);
  });
  const out = new Array(n);
  blocos.forEach(b => b.ks.forEach((k, j) => { out[seq[k].i] = b.ini + b.offs[j]; }));
  return out;
}

/* ---------------- estado antigo ----------------
   Antes, cada direção com galhos abria outra página (UI.path = [ideia, direção, direção...]).
   Agora o caminho para na ideia: a direção mais funda vira a selecionada, aberta junto com as mães. */
export function migrarUI(ui, abertos, achar) {
  if (!ui || !Array.isArray(ui.path) || ui.path.length <= 1) return false;
  const [key, ...resto] = ui.path;
  ui.path = [key];
  const ideia = achar(key);
  if (!ideia) { ui.sel = null; return true; }
  let n = ideia, rel = '';
  for (const s of resto) { const k = n.direcoes.find(d => d.slug === s); if (!k) break; n = k; rel = rel ? rel + '/' + s : s; }
  ui.sel = rel || null;
  if (rel) {
    const set = new Set(Array.isArray(abertos[key]) ? abertos[key] : abertosPadrao(ideia));
    ancestraisRel(rel).concat(n.direcoes.length ? [rel] : []).forEach(r => set.add(r));
    abertos[key] = [...set];
  }
  return true;
}
