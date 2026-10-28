// Item da Edição: uma direção (ou a ideia inteira) que ele decidiu levar adiante. Mora em
// ideias/<area>/<ideia>/decididas/<slug>/item.md (contrato em docs/FORMATO.md do repositório brainstorm).
// Leva uma cópia congelada do caminho até ela (## Contexto) e as ferramentas para aprofundar antes do Kanban.
// Funções puras: ler, montar o arquivo novo, pedidos, variáveis, perguntas e blocos.
import { abrir, lerCampos, lerSecao, acharSecao, titulos, valorYaml, descer, secao } from './formato.js';
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
// "respostas" não é cartão: é o "Enviar respostas" do cartão Perguntas (o Claude lê e diz o que entendeu)
export const PEDIDOS = FERRAMENTAS.filter(f => f.pede).map(f => f.id).concat('respostas');
// cartões que dependem das respostas: ficam "desatualizados" quando ele envia respostas novas
export const DEPENDEM = ['estrutura', 'riscos', 'comparar', 'versao', 'plano'];
export const VARIAVEIS = ['Formato', 'Canal', 'Prazo', 'Ritmo', 'Custo', 'Material'];
export const ESTADOS_ITEM = ['edicao', 'kanban', 'feita'];
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
export const marcaDe = it => ['rumo=' + codigoRumo(it.rumo)].concat(it.perguntas.filter(p => p.r.trim()).map(p => codigoResposta(p.q, p.r))).join(' ');
export function lerMarca(v) {
  let rumo = null; const cods = new Set();
  for (const t of String(v || '').split(/\s+/)) {
    if (t.startsWith('rumo=')) rumo = t.slice(5);
    else if (/^[0-9a-f]{8}$/.test(t)) cods.add(t);
  }
  return { rumo, cods };
}
// o que mudou desde o último envio: respostas novas ou mudadas (as que ficaram vazias não contam) e o rumo
export function novidades(it) {
  const m = lerMarca(it.enviadas);
  const respostas = it.perguntas.filter(p => p.r.trim() && !m.cods.has(codigoResposta(p.q, p.r))).length;
  const rumo = m.rumo != null ? codigoRumo(it.rumo) !== m.rumo : !!it.rumo.trim();
  return { respostas, rumo, algo: respostas > 0 || rumo, nunca: m.rumo == null && !m.cods.size };
}

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
    perguntas: pergs.map(b => ({ q: b.titulo, r: b.texto })),
    rumo: ler(['Perguntas', RUMO]) || '', descartadas: lerDescartadas(ler(['Perguntas', DESCARTADAS]) || ''),
    entendido: ler(['Perguntas', ENTENDI]) || '',
    enviadas: String(f.enviadas == null ? '' : f.enviadas), enviando: String(f.enviando == null ? '' : f.enviando),
    desatualizado: lerLista(f.desatualizado, DEPENDEM),
    variaveis: vars.valores, varExtras: vars.extras, sugestoes: sug.valores,
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
export const remendoResposta = (q, texto) => ({ sec: { [secao('Perguntas', q)]: descer(texto, 4) } });

/* ----- perguntas: o rumo dele, excluir (vira descartada), desfazer, trazer de volta, pergunta dele ----- */
// "### Descartadas" é uma lista "- pergunta", uma por linha
export function lerDescartadas(md) {
  const out = [];
  for (const ln of String(md || '').split('\n')) { const m = ln.match(/^\s*[-*+]\s+(.*\S)\s*$/); if (m) out.push(m[1]); }
  return out;
}
const comDescartadas = l => l.length ? l.map(q => '- ' + umaLinha(q)).join('\n') : null; // lista vazia = some
// o texto dele, como está (só os títulos descem para dentro da seção)
export const remendoRumo = texto => ({ sec: { [SEC_RUMO]: descer(texto, 4) } });
export function remendoExcluir(it, q) {
  const d = it.descartadas.filter(x => norm(x) !== norm(q)).concat(umaLinha(q));
  return { sec: { [secao('Perguntas', q)]: null, [SEC_DESCARTADAS]: comDescartadas(d) } };
}
// Desfazer: a pergunta volta com a resposta, no lugar k (contando só perguntas), e sai das descartadas
export function remendoVolta(text, p, k) {
  const b = blocos(lerSecao(abrir(text), ['Perguntas']) || '');
  const lista = b.blocos.filter(x => norm(x.titulo) !== norm(p.q));
  let pos = lista.length, n = 0;
  for (let j = 0; j < lista.length; j++) {
    const t = lista[j].titulo;
    if (norm(t) === norm(DESCARTADAS)) { pos = j; break; }
    if (reservada(t)) continue;
    if (n++ === k) { pos = j; break; }
  }
  lista.splice(pos, 0, { titulo: p.q, texto: p.r });
  const partes = lista.map(x => {
    if (norm(x.titulo) !== norm(DESCARTADAS)) return `### ${x.titulo}${x.texto ? '\n' + x.texto : ''}`;
    const d = comDescartadas(lerDescartadas(x.texto).filter(y => norm(y) !== norm(p.q)));
    return d ? `### ${x.titulo}\n${d}` : '';
  });
  return { sec: { Perguntas: [b.intro].concat(partes).filter(Boolean).join('\n\n') } };
}
// tirar das descartadas: a pergunta volta sem resposta, no fim da lista
export function remendoTrazer(it, q) {
  const sec = it.perguntas.some(p => norm(p.q) === norm(q)) ? {} : { [secao('Perguntas', q)]: '' };
  sec[SEC_DESCARTADAS] = comDescartadas(it.descartadas.filter(x => norm(x) !== norm(q)));
  return { sec };
}
// pergunta dele, já com a resposta; devolve null se o nome não serve (vazio, repetido ou reservado)
export function remendoNova(it, q, r) {
  q = umaLinha(q).replace(/#+$/, '').trim();
  if (!q || reservada(q) || it.perguntas.some(p => norm(p.q) === norm(q))) return null;
  const sec = { [secao('Perguntas', q)]: descer(String(r || '').trim(), 4) };
  if (it.descartadas.some(x => norm(x) === norm(q))) sec[SEC_DESCARTADAS] = comDescartadas(it.descartadas.filter(x => norm(x) !== norm(q)));
  return { sec };
}
export const remendoVariaveis = (valores, extras) => ({ sec: { [SEC_DECIDIDAS]: escreverVariaveis(valores, extras) } });

/* ----- enviar respostas: o pedido "respostas" leva junto a marca do que está indo ----- */
export const remendoEnviar = it => ({ fm: { pedido: comPedido(it.pedidos, 'respostas'), enviando: marcaDe(it) } });
export const remendoCancelarEnvio = it => ({ fm: { pedido: comPedido(it.pedidos, 'respostas', false), enviando: null } });
// "manter assim": tira o aviso de desatualizado de um cartão sem refazer
export function remendoManter(it, id) {
  const resto = it.desatualizado.filter(x => x !== id);
  return { fm: { desatualizado: resto.length ? resto.join(', ') : null } };
}
// modo local: o que a Action faria (texto genérico de exemplo, nunca ideias dele)
export function exemploRespostas(it) {
  const ex = exemplo('variaveis');
  const desat = DEPENDEM.filter(f => it.desatualizado.includes(f) || (estadoFerramenta(it, f) === 'pronto' && !it.pedidos.includes(f)));
  const sec = { [SEC_ENTENDI]: 'Exemplo do modo local: tu queres algo curto e direto, para quem está começando.\nO foco mudou para mostrar o processo, não só o resultado.\nIsso puxa para um formato mais simples de gravar.', ...ex.sec };
  if (!it.perguntas.some(p => /exemplo de seguimento/i.test(p.q))) sec[secao('Perguntas', 'Pergunta de exemplo de seguimento: o que muda se for em vídeo curto?')] = '';
  return { fm: { pedido: comPedido(it.pedidos, 'respostas', false), enviando: null, enviadas: it.enviando || marcaDe(it), desatualizado: desat.length ? desat.join(', ') : null }, sec };
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
