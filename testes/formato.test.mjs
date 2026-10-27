// Testes de ida e volta do formato. Rodar: node --test testes/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { abrir, fechar, lerCampos, lerSecao, aplicar, gravarSecao, slug, novaDirecao } from '../js/formato.js';
import { construir, separarFala } from '../js/modelo.js';

const REAL = process.env.BS_DADOS || join(process.env.HOME, 'Desktop/BRAINSTORM');
function arquivos(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? arquivos(p) : [p]; });
}
const reais = arquivos(join(REAL, 'ideias')).filter(p => /\/(ideia|direcao)\.md$/.test(p));

const IDEIA = `---
titulo: Série: um título de exemplo
area: youtube
estado: ativa            # ativa | guardada
criada: 2026-10-24
codigo: YT-002
pos: [0, 0]
---

## Bruto

### Fala
> Uma ideia de exemplo para o teste.

_24/10/2026_

### Anotações

## Lapidado

### Resumo
Duas ou três linhas.

### Brainstorm
\`\`\`
## isto não é título
\`\`\`
Texto livre.
`;

test('ida e volta sem mudança é idêntica (exemplo + arquivos reais)', () => {
  assert.equal(fechar(abrir(IDEIA)), IDEIA);
  assert.equal(aplicar(IDEIA, { fm: {}, sec: {} }), IDEIA);
  for (const p of reais) {
    const t = readFileSync(p, 'utf8');
    assert.equal(fechar(abrir(t)), t, p);
  }
});

test('frontmatter: dois-pontos sem aspas, listas curtas, comentário', () => {
  const f = lerCampos(abrir(IDEIA));
  assert.equal(f.titulo, 'Série: um título de exemplo');
  assert.equal(f.estado, 'ativa');
  assert.deepEqual(f.pos, [0, 0]);
  assert.equal(f.codigo, 'YT-002');
});

test('gravar um campo mexe só naquela linha e mantém estilo sem aspas', () => {
  const t = aplicar(IDEIA, { fm: { titulo: 'Reforma: nova versão' } });
  assert.equal(t, IDEIA.replace('titulo: Série: um título de exemplo', 'titulo: Reforma: nova versão'));
  const t2 = aplicar(IDEIA, { fm: { estado: 'guardada' } });
  assert.equal(t2, IDEIA.replace('estado: ativa            #', 'estado: guardada            #'));
  const t3 = aplicar(IDEIA, { fm: { pedido: 'desenvolver' } });
  assert.ok(t3.includes('pos: [0, 0]\npedido: desenvolver\n---'));
  assert.equal(aplicar(t3, { fm: { pedido: null } }), IDEIA);
  const t4 = aplicar(IDEIA, { fm: { pos: [120, -40] } });
  assert.ok(t4.includes('pos: [120, -40]\n'));
});

test('seções: ler e gravar Anotações sem tocar no resto', () => {
  const d = abrir(IDEIA);
  assert.equal(lerSecao(d, ['Bruto', 'Fala']), '> Uma ideia de exemplo para o teste.\n\n_24/10/2026_');
  assert.equal(lerSecao(d, ['Bruto', 'Anotações']), '');
  assert.equal(lerSecao(d, ['Lapidado', 'Brainstorm']), '```\n## isto não é título\n```\nTexto livre.');
  const t = aplicar(IDEIA, { sec: { 'Bruto/Anotações': 'linha 1\n\nlinha 2' } });
  assert.equal(t, IDEIA.replace('### Anotações\n\n## Lapidado', '### Anotações\nlinha 1\n\nlinha 2\n\n## Lapidado'));
  assert.equal(aplicar(t, { sec: { 'Bruto/Anotações': '' } }), IDEIA);
});

test('seção que não existe é criada no lugar certo', () => {
  const sem = IDEIA.replace('### Anotações\n\n', '');
  const t = aplicar(sem, { sec: { 'Bruto/Anotações': 'oi' } });
  assert.ok(t.includes('_24/10/2026_\n\n### Anotações\noi\n\n## Lapidado'), t);
  const dir = '---\ntitulo: X\n---\n\n## Lapidado\nTexto.\n';
  const t2 = aplicar(dir, { sec: { 'Bruto/Anotações': 'nota' } });
  assert.equal(t2, '---\ntitulo: X\n---\n\n## Bruto\n\n### Anotações\nnota\n\n## Lapidado\nTexto.\n');
  const t3 = aplicar('---\ntitulo: Y\n---\n', { sec: { 'Lapidado': 'abc' } });
  assert.equal(t3, '---\ntitulo: Y\n---\n## Lapidado\nabc\n');
});

test('Lapidado da direção no fim do arquivo', () => {
  const dir = novaDirecao('Reforma: de verdade', 3);
  assert.equal(lerCampos(abrir(dir)).titulo, 'Reforma: de verdade');
  const t = aplicar(dir, { sec: { 'Lapidado': 'Texto do Claude.' } });
  assert.ok(t.endsWith('## Lapidado\nTexto do Claude.\n'), t);
  assert.equal(aplicar(t, { sec: { 'Lapidado': '' } }), dir);
});

test('CRLF e BOM são preservados', () => {
  const crlf = '﻿' + IDEIA.replace(/\n/g, '\r\n');
  assert.equal(fechar(abrir(crlf)), crlf);
  const t = aplicar(crlf, { fm: { titulo: 'Z' } });
  assert.ok(t.startsWith('﻿---\r\ntitulo: Z\r\n'));
});

test('slug', () => {
  assert.equal(slug('Reforma de Verdade!'), 'reforma-de-verdade');
  assert.equal(slug('Série de flash: P&B'), 'serie-de-flash-p-b');
  assert.ok(slug('a'.repeat(30) + ' ' + 'b'.repeat(30)).length <= 40);
});

test('fala separada da nota e da data', () => {
  const f = separarFala('> linha 1\n> linha 2\n\n> outra\n\n_25/10/2026_\n\nTranscrições: [v1](anexos/a.md)');
  assert.deepEqual(f.falas, ['linha 1\nlinha 2', 'outra']);
  assert.equal(f.data, '25/10/2026');
  assert.equal(f.nota, 'Transcrições: [v1](anexos/a.md)');
});

test('árvore dos dados reais', { skip: !reais.length }, () => {
  const files = new Map(reais.map(p => [relative(REAL, p), { text: readFileSync(p, 'utf8') }]));
  const anexos = arquivos(join(REAL, 'ideias')).filter(p => p.includes('/anexos/')).map(p => ({ path: relative(REAL, p), sha: 'x' }));
  const m = construir(files, anexos);
  assert.equal(m.erros.length, 0, m.erros.join());
  assert.ok(m.ideias.length >= 6);
  for (const i of m.ideias) {
    assert.ok(i.titulo && i.area, i.key);
    assert.ok(i.fala.falas.length >= 1, 'fala de ' + i.key);
    const ordens = i.direcoes.map(d => d.ordem);
    assert.deepEqual(ordens, [...ordens].sort((a, b) => a - b), 'ordem de ' + i.key);
  }
  // títulos com dois-pontos sobrevivem à leitura
  for (const i of m.ideias) assert.ok(!i.titulo.startsWith('"'), 'aspas em ' + i.key);
});
