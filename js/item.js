// Item da Edição: uma direção (ou a ideia inteira) que ele decidiu levar adiante. Mora em
// ideias/<area>/<ideia>/decididas/<slug>/item.md (contrato em docs/FORMATO.md do repositório brainstorm).
// Leva uma cópia congelada do caminho até ela (## Contexto) e as ferramentas para aprofundar antes do Kanban.
// Funções puras: ler, montar o arquivo novo, pedidos, variáveis, perguntas e blocos.
import { abrir, lerCampos, lerSecao, acharSecao, titulos, valorYaml, descer, secao, aplicar as aplicarRemendo } from './formato.js';
import { lerTarefas } from './plano.js';

// as oito ferramentas, na ordem da página. "pede" = o Claude escreve (botão que marca o pedido no arquivo)
export const FERRAMENTAS = [
  { id: 'contexto', nome: 'Contexto herdado', sec: 'Contexto' },
  { id: 'perguntas', nome: 'Perguntas', sec: 'Perguntas', pede: 'Gerar perguntas', de_novo: 'Mais perguntas' },
  { id: 'variaveis', nome: 'Variáveis', sec: 'Variáveis', pede: 'Sugerir', de_novo: 'Sugerir de novo' },
  { id: 'estrutura', nome: 'Estrutura', sec: 'Estrutura', pede: 'Montar estrutura', de_novo: 'Refazer' },
  { id: 'riscos', nome: 'Riscos e cuidados', sec: 'Riscos', pede: 'Ver riscos', de_novo: 'Refazer' },
  { id: 'referencias', nome: 'Referências', sec: 'Referências' },
  { id: 'comparar', nome: 'Comparar alternativas', sec: 'Comparar', pede: 'Comparar', de_novo: 'Comparar de novo' },
  { id: 'versao', nome: 'Versão final', sec: 'Versão final', pede: 'Escrever versão final', de_novo: 'Reescrever' },
  { id: 'plano', nome: 'Plano', sec: 'Plano', pede: 'Gerar plano', de_novo: 'Refazer plano' }
];
export const FERRAMENTA = Object.fromEntries(FERRAMENTAS.map(f => [f.id, f]));
// "respostas" não é cartão: é o "Enviar respostas" do cartão Perguntas (o Claude lê e diz o que entendeu).
// "aprofundar" é o "↳ aprofundar esta" de uma pergunta respondida (o código dela vai no campo "aprofundar:")
export const PEDIDOS = FERRAMENTAS.filter(f => f.pede).map(f => f.id).concat('respostas', 'aprofundar');
// cartões que dependem das respostas: ficam "desatualizados" quando ele envia respostas novas
export const DEPENDEM = ['estrutura', 'riscos', 'comparar', 'versao', 'plano'];
export const VARIAVEIS = ['Formato', 'Canal', 'Prazo', 'Ritmo', 'Custo', 'Material'];
export const ESTADOS_ITEM = ['edicao', 'kanban', 'feita'];
// os três passos da página do item, um aberto por vez (o caminho principal). Referências e Comparar ficam à parte
export const PASSOS = [
  { id: 'aprofundar', nome: 'Aprofundar', cartoes: ['perguntas', 'variaveis'] },
  { id: 'montar', nome: 'Montar', cartoes: ['estrutura', 'riscos'] },
  { id: 'fechar', nome: 'Fechar', cartoes: ['versao', 'plano'] }
];
export const PASSO = Object.fromEntries(PASSOS.map(p => [p.id, p]));
export const EXTRAS = ['referencias', 'comparar'];
export const PRINCIPAIS = PASSOS.flatMap(p => p.cartoes);
// subseções de Variáveis: as dele e as do Claude ficam separadas, para um nunca apagar o outro
export const SEC_DECIDIDAS = secao('Variáveis', 'Decididas');
export const SEC_SUGESTOES = secao('Variáveis', 'Sugestões do Claude');

// subseções de Perguntas que não são perguntas: o rumo dele (a bússola) no começo e as descartadas no fim
export const RUMO = 'Para onde eu quero';
export const DESCARTADAS = 'Descartadas';
export const ENTENDI = 'O que entendi';    // do Claude, logo depois do rumo: o direcionamento que ele tirou das respostas
export const SEC_RUMO = secao('Perguntas', RUMO);
export const SEC_DESCARTADAS = secao('Perguntas', DESCARTADAS);
export const SEC_ENTENDI = secao('Perguntas', ENTENDI);

const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const reservada = t => [RUMO, DESCARTADAS, ENTENDI].some(r => norm(t) === norm(r));
const umaLinha = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* ---------------- pedidos: "pedido: perguntas, riscos" ---------------- */
export function lerPedidos(v) {
  const out = [];
  String(v == null ? '' : v).split(/[,\s]+/).map(norm).forEach(p => { if (PEDIDOS.includes(p) && !out.includes(p)) out.push(p); });
  return out;
}
// devolve o valor do campo (null = apagar a linha)
export function comPedido(lista, id, ligar = true) {
  const s = lista.filter(p => p !== id);
  if (ligar && PEDIDOS.includes(id)) s.push(id);
  return s.length ? s.join(', ') : null;
}

// "estrutura, riscos" -> só os ids conhecidos, sem repetir
export function lerLista(v, validos) {
  const out = [];
  String(v == null ? '' : v).split(/[,\s]+/).map(norm).forEach(p => { if (validos.includes(p) && !out.includes(p)) out.push(p); });
  return out;
}

/* ---------------- marca de enviado: o que já foi para o Claude ----------------
   Um código de 8 letras (FNV-1a de 32 bits sobre o UTF-8) por resposta enviada e um para o rumo:
   "enviadas: rumo=xxxxxxxx aaaaaaaa bbbbbbbb". O sistema/ferramentas.py faz a mesma conta. */
export function marca(s) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(String(s))) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const codigoResposta = (q, r) => marca(umaLinha(q) + '\n' + umaLinha(r));
export const codigoRumo = rumo => marca('rumo\n' + umaLinha(rumo));
// as descartadas (só os títulos, na ordem do arquivo): excluir ou trazer de volta também é mudança (desde 30/10)
export const codigoFora = lista => marca('fora\n' + lista.map(umaLinha).join('\n'));
export const marcaDe = it => ['rumo=' + codigoRumo(it.rumo), 'fora=' + codigoFora(it.descartadas)].concat(it.perguntas.filter(p => p.r.trim()).map(p => codigoResposta(p.q, p.r))).join(' ');
export function lerMarca(v) {
  let rumo = null, fora = null; const cods = new Set();
  for (const t of String(v || '').split(/\s+/)) {
    if (t.startsWith('rumo=')) rumo = t.slice(5);
    else if (t.startsWith('fora=')) fora = t.slice(5);
    else if (/^[0-9a-f]{8}$/.test(t)) cods.add(t);
  }
  return { rumo, fora, cods };
}
// "O que entendi" termina com "Em aberto: …" quando há perguntas vazias ou vagas (a Action garante): a tela mostra à parte
export function separarAberto(md) {
  const linhas = String(md || '').split('\n');
  const k = linhas.map(l => norm(l).replace(/^[-*_\s]+/, '')).findIndex(l => l.startsWith('em aberto'));
  if (k < 0) return { texto: String(md || ''), aberto: '' };
  const aberto = linhas[k].replace(/^[-*_\s]*em aberto[*_]*\s*:?[*_]*\s*/i, '').trim();
  return { texto: linhas.filter((_, j) => j !== k).join('\n').trim(), aberto };
}
// perguntas ainda sem resposta (em qualquer nível): o "Enviar respostas" avisa antes de mandar assim
export const semResposta = it => it.perguntas.filter(p => !p.r.trim()).length;
// o que mudou desde o último envio: respostas novas ou mudadas, respostas enviadas que sumiram (apagada ou pergunta
// excluída), o rumo e as descartadas (marca antiga, sem "fora=": as descartadas não contam). Mesma conta do
// ferramentas.py (novidades/tiradas)
export function novidades(it) {
  const m = lerMarca(it.enviadas);
  const ps = it.perguntas.filter(p => p.r.trim());
  const agora = new Set(ps.map(p => codigoResposta(p.q, p.r)));
  const respostas = ps.filter(p => !m.cods.has(codigoResposta(p.q, p.r))).length;
  const sumiram = [...m.cods].filter(c => !agora.has(c)).length;
  const tiradas = Math.max(0, sumiram - respostas);   // resposta mudada conta só como nova
  const rumo = m.rumo != null ? codigoRumo(it.rumo) !== m.rumo : !!it.rumo.trim();
  const fora = m.fora != null && codigoFora(it.descartadas) !== m.fora;
  return { respostas, tiradas, rumo, fora, algo: respostas > 0 || sumiram > 0 || rumo || fora, nunca: m.rumo == null && !m.cods.size };
}

/* ---------------- perguntas em galho ----------------
   Toda pergunta é um "###" de "## Perguntas"; a filha leva "↳" no começo, uma seta por nível abaixo da raiz
   ("### ↳ Filha?", "### ↳↳ Neta?"), e fica logo depois da mãe e das filhas que a mãe já tinha. A mãe é a pergunta
   anterior com um nível a menos. Item antigo (lista solta) = todas raízes. O sistema/ferramentas.py lê igual. */
export const SETA = '↳';
export const PROFUNDIDADE = 3;   // raiz, filha, neta: a neta não ganha filhas
export const ABERTAS_LIMITE = 3; // com tantas sem resposta (ou mais), "Mais perguntas" fica desligado (igual ao ferramentas.py)
export const MAX_GALHO = 2;      // "↳ aprofundar esta" pede 1 ou 2 filhas
export function nivelDe(titulo) {
  const m = String(titulo == null ? '' : titulo).trim().match(/^((?:↳\s*)*)(.*)$/);
  return { nivel: Math.min((m[1].match(/↳/g) || []).length + 1, PROFUNDIDADE), q: m[2].trim() };
}
export const tituloDe = (q, nivel) => (nivel > 1 ? SETA.repeat(nivel - 1) + ' ' : '') + q;
// o código de uma pergunta (a mãe no "aprofundar:" e no prompt); igual ao ferramentas.py (codigo_pergunta)
export const codigoPergunta = q => marca('pergunta\n' + umaLinha(q));
// blocos "###" → [{ h (título no arquivo), q (sem as setas), r, nivel, mae (índice ou -1) }]
export function arvore(bls) {
  const out = [];
  for (const b of bls) {
    let { nivel, q } = nivelDe(b.titulo);
    nivel = Math.min(nivel, out.length ? out[out.length - 1].nivel + 1 : 1); // sem mãe antes: sobe até achar
    let mae = -1;
    if (nivel > 1) for (let j = out.length - 1; j >= 0; j--) if (out[j].nivel === nivel - 1) { mae = j; break; }
    out.push({ h: b.titulo, q, r: b.texto, nivel, mae });
  }
  return out;
}
export const filhasDe = (ps, k) => ps.map((p, j) => p.mae === k ? j : -1).filter(j => j >= 0);
// o galho de k: ela e tudo o que nasceu dela (contíguo no arquivo) → [k, ..., último]
export function galhoDe(ps, k) {
  const out = [k];
  for (let j = k + 1; j < ps.length && ps[j].nivel > ps[k].nivel; j++) out.push(j);
  return out;
}
// respondida, acima do último nível e sem filha ainda sem resposta (o galho aberto espera por ele)
export function podeAprofundar(it, k) {
  const p = it.perguntas[k];
  return !!p && !!p.r.trim() && p.nivel < PROFUNDIDADE && filhasDe(it.perguntas, k).every(j => it.perguntas[j].r.trim());
}
// a pergunta está pedida no "aprofundar:" (Claude escrevendo as filhas dela)?
export const aprofundando = (it, k) => it.pedidos.includes('aprofundar') && !!it.perguntas[k] && it.aprofundar.includes(codigoPergunta(it.perguntas[k].q));

/* ---------------- variáveis: "- Nome: valor" ---------------- */
export function lerVariaveis(md) {
  const valores = {}, extras = [];
  for (const ln of String(md || '').split('\n')) {
    const m = ln.match(/^\s*[-*+]\s+([^:]+?):[ \t]*(.*)$/);
    const k = m && VARIAVEIS.find(v => norm(v) === norm(m[1]));
    if (k) valores[k] = m[2].trim();
    else if (ln.trim()) extras.push(ln);
  }
  return { valores, extras };
}
export function escreverVariaveis(valores, extras = []) {
  const linhas = VARIAVEIS.map(k => `- ${k}: ${String(valores[k] || '').replace(/\s+/g, ' ').trim()}`.trimEnd());
  return linhas.concat(extras.filter(l => l.trim())).join('\n');
}
// o valor que vale de cada variável: o dele, se ele escreveu; senão a sugestão do Claude (aceita sem ele confirmar).
// Só se calcula ao ler: nada do Claude é gravado em "Decididas". O sistema/ferramentas.py faz a mesma conta (valem).
export function valem(dele = {}, sugestoes = {}) {
  const out = {};
  for (const k of VARIAVEIS) {
    const d = String(dele[k] == null ? '' : dele[k]).trim(), s = String(sugestoes[k] == null ? '' : sugestoes[k]).trim();
    out[k] = d ? { valor: d, de: 'dele' } : s ? { valor: s, de: 'claude' } : { valor: '', de: '' };
  }
  return out;
}

/* ---------------- blocos: cada ### vira um bloco (Perguntas, Estrutura, Comparar, Contexto) ---------------- */
export function blocos(md, nivel = 3) {
  const linhas = String(md || '').split('\n');
  const hs = titulos(linhas).filter(h => h.level === nivel);
  const intro = (hs.length ? linhas.slice(0, hs[0].i) : linhas).join('\n').trim();
  const out = hs.map((h, k) => ({ titulo: h.name, texto: linhas.slice(h.i + 1, k + 1 < hs.length ? hs[k + 1].i : linhas.length).join('\n').trim() }));
  return { intro, blocos: out };
}

/* ---------------- contexto ---------------- */
// "### Ideia · Título" / "### Nível 2 · Título", e dentro "#### Fala", "#### Anotações", "#### Lapidado"
export function lerContexto(md) {
  return blocos(md, 3).blocos.map(b => {
    const k = b.titulo.indexOf(' · ');
    const sub = blocos(b.texto, 4).blocos;
    const pega = n => (sub.find(x => norm(x.titulo) === norm(n)) || {}).texto || '';
    return { rotulo: k > 0 ? b.titulo.slice(0, k) : '', titulo: k > 0 ? b.titulo.slice(k + 3) : b.titulo, fala: pega('Fala'), anotacoes: pega('Anotações'), lapidado: pega('Lapidado') };
  });
}

// caminho da direção dentro da ideia: "direcoes/a/direcoes/b" ↔ rel "a/b" ("." é a ideia)
export const origemDeRel = rel => rel ? rel.split('/').map(s => 'direcoes/' + s).join('/') : '.';
export function relDeOrigem(o) {
  const p = String(o || '').replace(/^\.\/?/, '').split('/').filter(Boolean);
  if (!p.length) return '';
  if (p.length % 2 || p.some((s, i) => i % 2 === 0 && s !== 'direcoes')) return null;
  return p.filter((_, i) => i % 2).join('/');
}

/* ---------------- ler o item ---------------- */
export function lerItem(path, text) {
  const doc = abrir(text);
  const f = lerCampos(doc);
  const ler = p => lerSecao(doc, p);
  const pergs = blocos(ler(['Perguntas']) || '').blocos.filter(b => !reservada(b.titulo));
  const vars = lerVariaveis(ler(['Variáveis', 'Decididas']) || '');
  const sug = lerVariaveis(ler(['Variáveis', 'Sugestões do Claude']) || '');
  const est = String(f.estado == null ? '' : f.estado).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const o = {
    kind: 'item', file: path, base: path.replace(/\/[^/]+$/, ''), campos: f,
    titulo: String(f.titulo || '').trim(), origem: String(f.origem || '.').trim() || '.',
    estado: ESTADOS_ITEM.includes(est) ? est : 'edicao', criado: String(f.criado || '').trim(),
    pedidos: lerPedidos(f.pedido),
    contexto: lerContexto(ler(['Contexto']) || ''),
    perguntas: arvore(pergs),
    aprofundar: String(f.aprofundar == null ? '' : f.aprofundar).split(/\s+/).filter(c => /^[0-9a-f]{8}$/.test(c)),
    rumo: ler(['Perguntas', RUMO]) || '', descartadas: lerDescartadas(ler(['Perguntas', DESCARTADAS]) || ''),
    descartes: lerDescartes(ler(['Perguntas', DESCARTADAS]) || ''),
    minhas: String(f.minhas == null ? '' : f.minhas).split(/\s+/).filter(c => /^[0-9a-f]{8}$/.test(c)),
    entendido: ler(['Perguntas', ENTENDI]) || '',
    enviadas: String(f.enviadas == null ? '' : f.enviadas), enviando: String(f.enviando == null ? '' : f.enviando),
    desatualizado: lerLista(f.desatualizado, DEPENDEM), mantido: lerLista(f.mantido, DEPENDEM),
    variaveis: vars.valores, varExtras: vars.extras, sugestoes: sug.valores, valem: valem(vars.valores, sug.valores),
    passo: lerPasso(f.passo),
    estrutura: ler(['Estrutura']) || '', riscos: ler(['Riscos']) || '', referencias: ler(['Referências']) || '',
    comparar: ler(['Comparar']) || '', versao: ler(['Versão final']) || '',
    plano: { afazer: lerTarefas(ler(['Plano', 'A fazer'])), fazendo: lerTarefas(ler(['Plano', 'Fazendo'])), feito: lerTarefas(ler(['Plano', 'Feito'])) },
    temPlano: acharSecao(doc, ['Plano']) != null
  };
  o.rel = relDeOrigem(o.origem);
  return o;
}

// estado de cada ferramenta no cartão: 'obras' (pedido aberto), 'pronto' ou 'vazio'
export function estadoFerramenta(it, id) {
  if (it.pedidos.includes(id)) return 'obras';
  const cheio = {
    contexto: it.contexto.length > 0,
    perguntas: it.perguntas.length > 0,
    variaveis: VARIAVEIS.some(k => it.variaveis[k]) || Object.keys(it.sugestoes).length > 0,
    estrutura: !!it.estrutura.trim(), riscos: !!it.riscos.trim(), referencias: !!it.referencias.trim(),
    comparar: !!it.comparar.trim(), versao: !!it.versao.trim(),
    plano: ['afazer', 'fazendo', 'feito'].some(c => it.plano[c].tarefas.length)
  }[id];
  return cheio ? 'pronto' : 'vazio';
}

// o estado que conta para a tela (lista lateral, linha dos passos, contagens, Kanban): desatualizado não é pronto.
// 'velho' = pronto, mas feito antes das últimas respostas enviadas (e ele não escolheu "manter assim")
export function estadoCartao(it, id) {
  const e = estadoFerramenta(it, id);
  return e === 'pronto' && it.desatualizado.includes(id) ? 'velho' : e;
}
export const prontas = it => PRINCIPAIS.filter(f => estadoCartao(it, f) === 'pronto').length;
export const velhos = it => PRINCIPAIS.filter(f => estadoCartao(it, f) === 'velho');
// "Mandar pro Kanban" e "Concluir" avisam antes quando o plano ou a versão final estão desatualizados
export const fecharVelho = it => ['versao', 'plano'].filter(f => estadoCartao(it, f) === 'velho');

/* ---------------- passo da página: "passo: montar" (sem a linha = Aprofundar) ---------------- */
export function lerPasso(v) {
  const p = norm(v);
  return PASSO[p] ? p : PASSOS[0].id;
}
// o passo em que ele está fica no arquivo (vale no celular também); Aprofundar é o começo, sem linha
export const remendoPasso = id => ({ fm: { passo: PASSO[id] && id !== PASSOS[0].id ? id : null } });
// estado do passo pelos cartões dele: 'obras' (algum pedido aberto), 'velho' (algum desatualizado), 'pronto'
// (todos), 'meio' (algum) ou 'vazio'. Desatualizado nunca conta como pronto
export function estadoPasso(it, id) {
  const es = PASSO[id].cartoes.map(f => estadoCartao(it, f));
  if (es.includes('obras')) return 'obras';
  if (es.includes('velho')) return 'velho';
  if (es.every(e => e === 'pronto')) return 'pronto';
  return es.includes('pronto') ? 'meio' : 'vazio';
}

/* ---------------- decidir: o item novo, com o contexto congelado ---------------- */
// cadeia = [ideia, direção nível 1, ..., ponta]; cada nó com titulo, anotacoes, lapidado (e a ideia com falaMd)
export function contextoMd(cadeia) {
  return cadeia.map((n, k) => {
    const partes = [`### ${k ? `Nível ${k}` : 'Ideia'} · ${String(n.titulo).replace(/\s+/g, ' ').trim()}`];
    if (!k && String(n.falaMd || '').trim()) partes.push('#### Fala', descer(n.falaMd.trim(), 5));
    if (String(n.anotacoes || '').trim()) partes.push('#### Anotações', descer(n.anotacoes.trim(), 5));
    if (String(n.lapidado || '').trim()) partes.push('#### Lapidado', descer(n.lapidado.trim(), 5));
    return partes.join('\n\n');
  }).join('\n\n');
}

export function novoItem({ cadeia, usados = [], hoje }) {
  const ideia = cadeia[0], alvo = cadeia[cadeia.length - 1];
  const rel = cadeia.slice(1).map(n => n.slug).join('/');
  const base0 = alvo.slug || 'item';
  let s = base0, k = 2; const u = new Set(usados);
  while (u.has(s)) s = `${base0}-${k++}`;
  const path = `${ideia.base}/decididas/${s}/item.md`;
  const text = `---
titulo: ${valorYaml(alvo.titulo)}
origem: ${origemDeRel(rel)}
estado: edicao
criado: ${hoje}
---

## Contexto

${contextoMd(cadeia)}

## Perguntas

## Variáveis

### Decididas
${escreverVariaveis({})}

## Estrutura

## Riscos

## Referências

## Comparar

## Versão final

## Plano

### A fazer

### Fazendo

### Feito
`;
  return { path, slug: s, rel, text };
}

/* ---------------- remendos das ferramentas (o que o app grava) ---------------- */
// h = o título da pergunta no arquivo (com as setas, na filha)
export const remendoResposta = (h, texto) => ({ sec: { [secao('Perguntas', h)]: descer(texto, 4) } });

/* ----- perguntas: o rumo dele, excluir (vira descartada), desfazer, trazer de volta, pergunta dele ----- */
// "### Descartadas" é uma lista "- pergunta", uma por linha. Desde 30/10 cada uma leva a resposta dele embaixo
// (linhas "    > texto", recuadas) e o galho que saiu junto vem logo depois, com as setas relativas ("- ↳ Filha?"):
//   - Pergunta excluída?
//       > resposta dele
//   - ↳ Filha que saiu junto?
//       > resposta da filha
// Um "grupo" é a pergunta sem seta e as com seta logo abaixo dela. Itens antigos (só títulos) leem igual.
const RESP_DESC = /^\s{2,}>\s?(.*)$/;
export function lerDescartes(md) {
  const grupos = []; let ult = null;
  for (const ln of String(md || '').split('\n')) {
    const m = ln.match(/^\s{0,3}[-*+]\s+(.*\S)\s*$/);
    if (m) {
      const { nivel, q } = nivelDe(m[1]);
      ult = { h: tituloDe(q, nivel), q, r: [], nivel };
      if (nivel === 1 || !grupos.length) grupos.push([ult]); else grupos[grupos.length - 1].push(ult);
      continue;
    }
    const r = ln.match(RESP_DESC);
    if (r && ult) ult.r.push(r[1]);
  }
  return grupos.map(g => g.map(x => Object.assign(x, { r: x.r.join('\n').trim() })));
}
// só os títulos (sem setas), na ordem do arquivo: o que não volta ao prompt nem às perguntas novas
export const lerDescartadas = md => lerDescartes(md).flat().map(x => x.q);
export function escreverDescartes(grupos) {
  const linhas = [];
  for (const g of grupos) for (const x of g) {
    linhas.push('- ' + tituloDe(umaLinha(x.q), x.nivel || 1));
    if (String(x.r || '').trim()) for (const l of String(x.r).trim().split('\n')) linhas.push(l.trim() ? '    > ' + l : '    >');
  }
  return linhas.length ? linhas.join('\n') : null; // lista vazia = some
}
// tira dos grupos as perguntas com esses títulos (o grupo que fica vazio some; filha que fica sem a raiz sobe)
function semDescartes(grupos, qs) {
  const fora = q => qs.some(y => norm(y) === norm(q));
  return grupos.map(g => {
    const resto = g.filter(x => !fora(x.q)); if (!resto.length) return null;
    const sobe = resto[0].nivel - 1;
    return resto.map(x => Object.assign({}, x, { nivel: Math.max(1, x.nivel - sobe) }));
  }).filter(Boolean);
}
// o texto dele, como está (só os títulos descem para dentro da seção)
export const remendoRumo = texto => ({ sec: { [SEC_RUMO]: descer(texto, 4) } });
// excluir leva o galho junto (as filhas nasceram da resposta dela); todas viram descartadas, para não voltarem
export function remendoExcluir(it, q) {
  const k = it.perguntas.findIndex(p => norm(p.q) === norm(q) || norm(p.h) === norm(q));
  const ps = k >= 0 ? galhoDe(it.perguntas, k).map(j => it.perguntas[j]) : [{ h: q, q }];
  // o galho vai inteiro, com a resposta de cada uma e os níveis relativos à que foi excluída
  const base = ps[0].nivel || 1;
  const grupo = ps.map(p => ({ q: umaLinha(p.q), r: p.r || '', nivel: (p.nivel || 1) - base + 1 }));
  const d = semDescartes(it.descartes || [], grupo.map(x => x.q)).concat([grupo]);
  const sec = {};
  for (const p of ps) sec[secao('Perguntas', p.h || p.q)] = null;
  sec[SEC_DESCARTADAS] = escreverDescartes(d);
  return { sec };
}
// a seção Perguntas remontada a partir dos blocos (intro + "### título" + texto)
function montarPerguntas(intro, lista) {
  return { sec: { Perguntas: [intro].concat(lista.map(x => x.titulo != null ? `### ${x.titulo}${x.texto ? '\n' + x.texto : ''}` : '')).filter(Boolean).join('\n\n') } };
}
// Desfazer: a pergunta volta com a resposta (e o galho dela, se veio junto), no lugar k (contando só perguntas), e
// sai das descartadas. "p" é uma pergunta { h?, q, r } ou a lista do galho, na ordem do arquivo
export function remendoVolta(text, p, k) {
  const volta = [].concat(p).map(x => ({ titulo: x.h || x.q, texto: x.r, q: x.q }));
  const tira = t => volta.some(v => norm(v.titulo) === norm(t));
  const b = blocos(lerSecao(abrir(text), ['Perguntas']) || '');
  const lista = b.blocos.filter(x => !tira(x.titulo));
  let pos = lista.length, n = 0;
  for (let j = 0; j < lista.length; j++) {
    const t = lista[j].titulo;
    if (norm(t) === norm(DESCARTADAS)) { pos = j; break; }
    if (reservada(t)) continue;
    if (n++ === k) { pos = j; break; }
  }
  lista.splice(pos, 0, ...volta.map(v => ({ titulo: v.titulo, texto: v.texto })));
  return montarPerguntas(b.intro, lista.map(x => {
    if (norm(x.titulo) !== norm(DESCARTADAS)) return x;
    const d = escreverDescartes(semDescartes(lerDescartes(x.texto), volta.map(v => v.q)));
    return d ? { titulo: x.titulo, texto: d } : {};
  }));
}

/* ----- "↳ aprofundar esta": pede ao Claude 1 ou 2 perguntas que partem da resposta de k ----- */
export function remendoAprofundar(it, k) {
  const p = it.perguntas[k]; if (!p) return null;
  const cods = it.aprofundar.filter(c => c !== codigoPergunta(p.q)).concat(codigoPergunta(p.q));
  return { fm: { pedido: comPedido(it.pedidos, 'aprofundar'), aprofundar: cods.join(' ') } };
}
export const remendoCancelarAprofundar = it => ({ fm: { pedido: comPedido(it.pedidos, 'aprofundar', false), aprofundar: null } });
// a filha entra logo depois do galho da mãe (no texto de agora): devolve o remendo da seção Perguntas
export function remendoFilhas(text, maeQ, filhas) {
  const b = blocos(lerSecao(abrir(text), ['Perguntas']) || '');
  const ps = arvore(b.blocos.filter(x => !reservada(x.titulo)));
  const k = ps.findIndex(p => norm(p.q) === norm(maeQ)); if (k < 0 || !filhas.length) return null;
  const ultimo = ps[galhoDe(ps, k).pop()].h;
  const j = b.blocos.findIndex(x => x.titulo === ultimo);
  const lista = b.blocos.slice();
  lista.splice(j + 1, 0, ...filhas.map(q => ({ titulo: tituloDe(umaLinha(q), ps[k].nivel + 1), texto: '' })));
  return montarPerguntas(b.intro, lista);
}
// modo local: o que a Action faria no "aprofundar" (perguntas genéricas de exemplo, nunca ideias dele)
export function exemploAprofundar(text, it) {
  let t = text, n = it.perguntas.filter(p => /^Exemplo de seguimento \d+/.test(p.q)).length;
  const maes = it.perguntas.filter((p, k) => it.aprofundar.includes(codigoPergunta(p.q)) && podeAprofundar(it, k));
  let sec = {};
  for (const m of maes) {
    const r = remendoFilhas(t, m.q, [`Exemplo de seguimento ${++n}: o que isso muda na prática?`]);
    if (!r) continue;
    sec = r.sec;
    t = aplicarRemendo(t, { sec: r.sec });
  }
  return { fm: { pedido: comPedido(it.pedidos, 'aprofundar', false), aprofundar: null }, sec };
}
// tirar das descartadas: o grupo k volta inteiro, como estava (pergunta, resposta e o galho que saiu junto), no fim
// da lista (antes das Descartadas). A que já existe de novo nas perguntas não volta duplicada. "text" = o arquivo de agora
export function remendoTrazer(text, k) {
  const b = blocos(lerSecao(abrir(text), ['Perguntas']) || '');
  const dj = b.blocos.findIndex(x => norm(x.titulo) === norm(DESCARTADAS)); if (dj < 0) return null;
  const grupos = lerDescartes(b.blocos[dj].texto), g = grupos[k]; if (!g) return null;
  const ja = arvore(b.blocos.filter(x => !reservada(x.titulo))).map(p => p.q);
  const volta = g.filter(x => !ja.some(q => norm(q) === norm(x.q)));
  const lista = b.blocos.slice();
  const resto = escreverDescartes(grupos.filter((_, j) => j !== k));
  lista.splice(dj, 1, ...volta.map(x => ({ titulo: tituloDe(x.q, x.nivel), texto: x.r })), ...(resto ? [{ titulo: b.blocos[dj].titulo, texto: resto }] : []));
  return montarPerguntas(b.intro, lista);
}
// pergunta dele, já com a resposta; devolve null se o nome não serve (vazio, repetido ou reservado)
export function remendoNova(it, q, r) {
  q = umaLinha(q).replace(/#+$/, '').trim();
  if (!q || reservada(q) || it.perguntas.some(p => norm(p.q) === norm(q))) return null;
  const sec = { [secao('Perguntas', q)]: descer(String(r || '').trim(), 4) };
  if (it.descartadas.some(x => norm(x) === norm(q))) sec[SEC_DESCARTADAS] = escreverDescartes(semDescartes(it.descartes, [q]));
  // as perguntas dele ficam marcadas: o "Mais perguntas" não as aprofunda sozinho (só o "↳ aprofundar esta")
  const minhas = it.minhas.filter(c => c !== codigoPergunta(q)).concat(codigoPergunta(q));
  return { sec, fm: { minhas: minhas.join(' ') } };
}
export const remendoVariaveis = (valores, extras) => ({ sec: { [SEC_DECIDIDAS]: escreverVariaveis(valores, extras) } });

/* ----- enviar respostas: o pedido "respostas" leva junto a marca do que está indo ----- */
export const remendoEnviar = it => ({ fm: { pedido: comPedido(it.pedidos, 'respostas'), enviando: marcaDe(it) } });
export const remendoCancelarEnvio = it => ({ fm: { pedido: comPedido(it.pedidos, 'respostas', false), enviando: null } });
// "manter assim": tira o aviso de desatualizado de um cartão sem refazer e registra a escolha dele em "mantido:"
// (não volta a avisar; um envio novo de respostas, que muda o que o cartão leu, avisa de novo)
export function remendoManter(it, id) {
  const resto = it.desatualizado.filter(x => x !== id);
  const mant = it.mantido.filter(x => x !== id).concat(DEPENDEM.includes(id) ? [id] : []);
  return { fm: { desatualizado: resto.length ? resto.join(', ') : null, mantido: mant.length ? mant.join(', ') : null } };
}
// modo local: o que a Action faria (texto genérico de exemplo, nunca ideias dele)
export function exemploRespostas(it) {
  const ex = exemplo('variaveis');
  const desat = DEPENDEM.filter(f => it.desatualizado.includes(f) || (estadoFerramenta(it, f) === 'pronto' && !it.pedidos.includes(f)));
  const abertas = it.perguntas.filter(p => !p.r.trim()).map(p => p.q);
  const sec = { [SEC_ENTENDI]: 'Exemplo do modo local: tu quer algo curto e direto, para quem está começando.\nO foco mudou para mostrar o processo, não só o resultado.\nIsso puxa para um formato mais simples de gravar.' + (abertas.length ? '\nEm aberto: ' + abertas.join(' · ') : ''), ...ex.sec };
  if (!it.perguntas.some(p => /exemplo de seguimento/i.test(p.q))) sec[secao('Perguntas', 'Pergunta de exemplo de seguimento: o que muda se for em vídeo curto?')] = '';
  const mant = it.mantido.filter(f => !desat.includes(f));
  return { fm: { pedido: comPedido(it.pedidos, 'respostas', false), enviando: null, enviadas: it.enviando || marcaDe(it), desatualizado: desat.length ? desat.join(', ') : null, mantido: mant.length ? mant.join(', ') : null }, sec };
}

// respostas de exemplo do modo local (?local=1): só para testar a tela; textos genéricos, nunca ideias dele
export function exemplo(id) {
  return {
    perguntas: { sec: { Perguntas: '### Quem tu queres que assista primeiro?\n\n### O que a pessoa leva no fim?\n\n### Qual é o gancho dos primeiros segundos?\n\n### O que só tu consegues mostrar aqui?\n\n### Onde isso pode dar errado?' } },
    variaveis: { sec: { [SEC_SUGESTOES]: '- Formato: vídeo de 10 minutos\n- Canal: YouTube\n- Prazo: primeiro em 2 semanas\n- Ritmo: 1 a cada 15 dias\n- Custo: só o tempo de gravar\n- Material: fotos de exemplo e câmera' } },
    estrutura: { sec: { Estrutura: '### 1. Gancho\nAbre com o exemplo mais forte.\n\n### 2. A regra\nDiz o que vai ser comparado.\n\n### 3. Os pares\nTrês pares, um de cada vez.\n\n### 4. Fecho\nPergunta para os comentários.' } },
    riscos: { sec: { Riscos: '- **Imagem de terceiros:** mostrar a fonte na tela.\n- **Ficar longo:** cortar cada par em 2 minutos.' } },
    comparar: { sec: { Comparar: '### Irmã de exemplo\nTem um ritmo bom. Vale puxar a abertura.\n\n### Em resumo\nEsta direção fica, com a abertura da irmã.' } },
    versao: { sec: { 'Versão final': 'Um texto curto de exemplo: o que vai ser feito, para quem e em que formato.' } },
    plano: { sec: { [secao('Plano', 'A fazer')]: '- Anotar hoje os três primeiros exemplos\n- Separar as imagens\n- Escrever o gancho\n- Gravar o piloto\n- Editar e revisar\n- Publicar' } }
  }[id] || null;
}
