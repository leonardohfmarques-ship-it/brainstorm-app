// Plano de ação: as tarefas de uma ideia decidida (## Plano › ### A fazer / ### Fazendo / ### Feito).
// Cada tarefa é um item "- texto" na ordem da lista. O que não é item (texto antes do primeiro item, linhas
// de continuação embaixo de um item) é guardado e volta igual ao gravar.

export const COLUNAS = [
  { id: 'afazer', nome: 'A fazer', sec: 'Plano/A fazer' },
  { id: 'fazendo', nome: 'Fazendo', sec: 'Plano/Fazendo' },
  { id: 'feito', nome: 'Feito', sec: 'Plano/Feito' }
];
const ITEM = /^[-*+][ \t]+(.*)$/;
const CAIXA = /^\[[ xX]\][ \t]+/;

// markdown de uma coluna → { cabeca: [linhas], tarefas: [{ texto, extra: [linhas] }] }
export function lerTarefas(md) {
  const out = { cabeca: [], tarefas: [] };
  if (!md) return out;
  let atual = null;
  for (const ln of String(md).split('\n')) {
    const m = ln.match(ITEM);
    if (m) { atual = { texto: m[1].replace(CAIXA, '').trim(), extra: [] }; out.tarefas.push(atual); }
    else if (atual) atual.extra.push(ln);
    else out.cabeca.push(ln);
  }
  return out;
}

// as linhas de detalhe de uma tarefa (recuadas embaixo dela), sem o recuo nem o "- "
export const detalhe = t => (t.extra || []).map(l => l.trim().replace(/^[-*+]\s+/, '')).filter(Boolean);

const semFimVazio = l => { const a = l.slice(); while (a.length && !a[a.length - 1].trim()) a.pop(); return a; };
const umaLinha = t => String(t == null ? '' : t).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

export function escreverTarefas(col) {
  const linhas = semFimVazio(col.cabeca || []);
  if (linhas.length && col.tarefas.length) linhas.push('');
  col.tarefas.forEach(t => { linhas.push('- ' + umaLinha(t.texto)); linhas.push(...semFimVazio(t.extra || [])); });
  return linhas.join('\n');
}

// plano = { afazer, fazendo, feito } (cada um no formato de lerTarefas)
export function vazio() { return { afazer: lerTarefas(''), fazendo: lerTarefas(''), feito: lerTarefas('') }; }
export function copiar(p) {
  const o = {};
  for (const c of COLUNAS) o[c.id] = { cabeca: p[c.id].cabeca.slice(), tarefas: p[c.id].tarefas.map(t => ({ texto: t.texto, extra: t.extra.slice() })) };
  return o;
}
export function total(p) { return COLUNAS.reduce((n, c) => n + p[c.id].tarefas.length, 0); }

// remendo para o arquivo (as três colunas juntas, na ordem)
export function remendo(p) {
  const sec = {};
  for (const c of COLUNAS) sec[c.sec] = escreverTarefas(p[c.id]);
  return { sec };
}

// mover: de { col, i } para { col, i } (i = posição final na coluna de destino)
export function mover(p, de, para) {
  const o = copiar(p);
  const origem = o[de.col].tarefas;
  if (de.i < 0 || de.i >= origem.length) return o;
  const [t] = origem.splice(de.i, 1);
  const destino = o[para.col].tarefas;
  const i = Math.max(0, Math.min(destino.length, para.i));
  destino.splice(i, 0, t);
  return o;
}
export function criar(p, col, texto, i) {
  const o = copiar(p); const l = o[col].tarefas;
  l.splice(i == null ? l.length : Math.max(0, Math.min(l.length, i)), 0, { texto: umaLinha(texto), extra: [] });
  return o;
}
export function editar(p, col, i, texto) { const o = copiar(p); if (o[col].tarefas[i]) o[col].tarefas[i].texto = umaLinha(texto); return o; }
export function apagar(p, col, i) { const o = copiar(p); o[col].tarefas.splice(i, 1); return o; }

// o aviso ao mandar pro Kanban: conta cada coluna (reteste de 30/10: dizia "14 em A fazer" com 2 já em Fazendo e Feito)
export function avisoKanban(p) {
  const n = c => p[c].tarefas.length, t = k => k === 1 ? '1 tarefa' : `${k} tarefas`;
  const outras = [n('fazendo') ? `${n('fazendo')} em Fazendo` : '', n('feito') ? `${n('feito')} em Feito` : ''].filter(Boolean);
  return `No Kanban: ${t(n('afazer'))} em A fazer${outras.length ? (outras.length === 2 ? `, ${outras[0]} e ${outras[1]}` : ` e ${outras[0]}`) : ''}.`;
}
