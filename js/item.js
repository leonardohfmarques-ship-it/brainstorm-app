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
export const PEDIDOS = FERRAMENTAS.filter(f => f.pede).map(f => f.id);
export const VARIAVEIS = ['Formato', 'Canal', 'Prazo', 'Ritmo', 'Custo', 'Material'];
export const ESTADOS_ITEM = ['edicao', 'kanban', 'feita'];
// subseções de Variáveis: as dele e as do Claude ficam separadas, para um nunca apagar o outro
export const SEC_DECIDIDAS = secao('Variáveis', 'Decididas');
export const SEC_SUGESTOES = secao('Variáveis', 'Sugestões do Claude');

const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

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
  const pergs = blocos(ler(['Perguntas']) || '').blocos;
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
export const remendoVariaveis = (valores, extras) => ({ sec: { [SEC_DECIDIDAS]: escreverVariaveis(valores, extras) } });

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
