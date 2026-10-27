// Monta a árvore de ideias e direções a partir dos arquivos de ideias/ (contrato em docs/FORMATO.md).
import { abrir, lerCampos, lerSecao } from './formato.js';
import { lerTarefas } from './plano.js';

export const AREAS = [
  { id: 'youtube', nome: 'YouTube', c: '#E2231A', b: 'Y' },
  { id: 'instagram', nome: 'Instagram', c: '#1F4FD8', b: 'I' },
  { id: 'tatuagem', nome: 'Tatuagem', c: '#111111', b: 'T' },
  { id: 'soltas', nome: 'Soltas', c: '#0A7F55', b: 'S' }
];
export const AREA = Object.fromEntries(AREAS.map(a => [a.id, a]));

const RE_IDEIA = /^ideias\/([^/]+)\/([^/]+)\/ideia\.md$/;
const RE_DIR = /^(.+)\/direcoes\/([^/]+)\/direcao\.md$/;
const RE_ANEXO = /^(.+?)\/anexos\/(.+)$/;

// estados de uma ideia: ativa (Brainstorm), guardada (gaveta), edicao, kanban, feita. O resto vira ativa.
export const ESTADOS = ['ativa', 'guardada', 'edicao', 'kanban', 'feita'];
export function lerEstado(v) {
  const e = String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return ESTADOS.includes(e) ? e : 'ativa';
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const par = v => Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'number' && Number.isFinite(x)) ? v : null;

// Fala: as linhas citadas ("> ...") viram a fala; o resto (data, links de anexo) fica como nota em markdown.
export function separarFala(md) {
  const falas = [], resto = []; let bloco = null;
  String(md || '').split('\n').forEach(ln => {
    if (/^\s{0,3}>/.test(ln)) {
      const t = ln.replace(/^\s{0,3}>\s?/, '');
      if (!bloco) { bloco = []; falas.push(bloco); }
      bloco.push(t);
    } else { bloco = null; resto.push(ln); }
  });
  const data = (resto.join('\n').match(/^\s*_(\d{1,2}\/\d{1,2}\/\d{4})_\s*$/m) || [])[1] || '';
  const sobra = resto.filter(l => !/^\s*_\d{1,2}\/\d{1,2}\/\d{4}_\s*$/.test(l)).join('\n').trim();
  return { falas: falas.map(b => b.join('\n').trim()).filter(Boolean), data, nota: sobra };
}

function lerNo(path, text) {
  const doc = abrir(text);
  const f = lerCampos(doc);
  return {
    file: path, base: path.replace(/\/[^/]+$/, ''), campos: f,
    titulo: String(f.titulo || '').trim(), pedido: f.pedido ? String(f.pedido).trim() : '',
    pos: par(f.pos),
    anotacoes: lerSecao(doc, ['Bruto', 'Anotações']) || '',
    lapidado: lerSecao(doc, ['Lapidado']) || '',
    direcoes: [], anexos: []
  };
}

export function construir(files, anexos = []) {
  const erros = [];
  const porBase = new Map();
  const ideias = [];
  const paths = [...files.keys()].sort();
  for (const p of paths) {
    const m = p.match(RE_IDEIA); if (!m) continue;
    try {
      const n = lerNo(p, files.get(p).text);
      const area = AREA[m[1]] ? m[1] : (AREA[n.campos.area] ? n.campos.area : 'soltas');
      const doc = abrir(files.get(p).text);
      Object.assign(n, {
        kind: 'ideia', key: m[1] + '/' + m[2], slug: m[2], area, pasta: m[1],
        estado: lerEstado(n.campos.estado),
        criada: String(n.campos.criada || '').trim(), codigo: String(n.campos.codigo || '').trim(),
        fala: separarFala(lerSecao(doc, ['Bruto', 'Fala']) || ''),
        brutoAnexos: lerSecao(doc, ['Bruto', 'Anexos']) || '',
        resumo: lerSecao(doc, ['Lapidado', 'Resumo']) || '',
        edicao: {
          existe: lerSecao(doc, ['Edição']) != null,
          escolhas: lerSecao(doc, ['Edição', 'Escolhas']) || '',
          versao: lerSecao(doc, ['Edição', 'Versão final']) || ''
        },
        plano: {
          afazer: lerTarefas(lerSecao(doc, ['Plano', 'A fazer'])),
          fazendo: lerTarefas(lerSecao(doc, ['Plano', 'Fazendo'])),
          feito: lerTarefas(lerSecao(doc, ['Plano', 'Feito']))
        },
        temPlano: lerSecao(doc, ['Plano']) != null
      });
      if (!n.titulo) n.titulo = m[2].replace(/-/g, ' ');
      ideias.push(n); porBase.set(n.base, n);
    } catch (e) { erros.push(p); }
  }
  // direções: das mais rasas para as mais fundas, para a mãe existir antes
  const dirs = paths.filter(p => RE_DIR.test(p) && p.startsWith('ideias/')).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  for (const p of dirs) {
    const m = p.match(RE_DIR); const mae = porBase.get(m[1]);
    if (!mae) { erros.push(p); continue; }
    try {
      const n = lerNo(p, files.get(p).text);
      Object.assign(n, { kind: 'direcao', slug: m[2], ordem: num(n.campos.ordem), mae: mae });
      if (!n.titulo) n.titulo = m[2].replace(/-/g, ' ');
      mae.direcoes.push(n); porBase.set(n.base, n);
    } catch (e) { erros.push(p); }
  }
  for (const a of anexos) {
    const m = a.path.match(RE_ANEXO); if (!m) continue;
    // a pasta anexos mais funda que casa (o regex pega a primeira; procura a dona exata)
    let dona = null, base = a.path;
    while (base.includes('/anexos/')) { base = base.slice(0, base.lastIndexOf('/anexos/')); if (porBase.has(base)) { dona = porBase.get(base); break; } }
    if (dona && !/(^|\/)\.DS_Store$/.test(a.path)) dona.anexos.push(Object.assign({ nome: a.path.slice(dona.base.length + 8) }, a));
  }
  const ordenar = n => {
    n.direcoes.sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || a.slug.localeCompare(b.slug));
    n.direcoes.forEach(ordenar);
  };
  ideias.forEach(ordenar);
  ideias.sort((a, b) => (a.criada || '').localeCompare(b.criada || '') || a.slug.localeCompare(b.slug));
  return { ideias, erros, porBase };
}

// algum pedido aberto nesta ideia ou dentro dela?
export function temPedido(n) { return !!n.pedido || n.direcoes.some(temPedido); }
