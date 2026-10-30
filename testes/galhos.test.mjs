// Perguntas em galho: a filha nasce de uma resposta e fica embaixo da mãe ("### ↳ Filha?"). Exemplos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicar } from '../js/formato.js';
import * as I from '../js/item.js';

const ITEM = `---
titulo: Item de exemplo
origem: .
estado: edicao
criado: 2026-10-29
---

## Contexto

## Perguntas

### Para onde eu quero
Algo curto.

### Quem assiste primeiro?
Quem nunca tatuou.

### ↳ Que medo aparece mais?
A dor.

### ↳↳ Em que parte do corpo?
Costela.

### Qual formato?
Reel curto.

### Descartadas
- Vai ter convidado?

## Variáveis
`;
const ler = t => I.lerItem('ideias/youtube/x/decididas/y/item.md', t);

test('formato da árvore: nível pelas setas, mãe = a anterior com um nível a menos; item antigo = raízes', () => {
  const it = ler(ITEM);
  assert.deepEqual(it.perguntas.map(p => [p.q, p.nivel, p.mae]), [
    ['Quem assiste primeiro?', 1, -1], ['Que medo aparece mais?', 2, 0], ['Em que parte do corpo?', 3, 1], ['Qual formato?', 1, -1]]);
  assert.equal(it.perguntas[1].h, '↳ Que medo aparece mais?');
  assert.equal(it.perguntas[2].r, 'Costela.');
  assert.deepEqual(I.nivelDe('↳ ↳ Neta?'), { nivel: 3, q: 'Neta?' });
  assert.equal(I.nivelDe('↳↳↳↳ Funda?').nivel, 3);
  assert.equal(I.tituloDe('Neta?', 3), '↳↳ Neta?');
  // mesmo valor no sistema/ferramentas.py (codigo_pergunta)
  assert.equal(I.codigoPergunta('Quem assiste primeiro?'), '06278cfd');
  // lista solta (antes dos galhos): todas raízes; filha sem mãe antes sobe para raiz
  const antigo = ler(ITEM.replace(/↳+ /g, ''));
  assert.deepEqual(antigo.perguntas.map(p => [p.nivel, p.mae]), [[1, -1], [1, -1], [1, -1], [1, -1]]);
  assert.deepEqual(ler(ITEM.replace('### Quem assiste primeiro?', '### ↳↳ Quem assiste primeiro?')).perguntas.slice(0, 1).map(p => [p.q, p.nivel]), [['Quem assiste primeiro?', 1]]);
  // a marca de enviado usa a pergunta sem as setas
  assert.ok(I.marcaDe(it).includes(I.codigoResposta('Que medo aparece mais?', 'A dor.')));
});

test('responder uma filha grava só a resposta dela; o resto volta byte a byte', () => {
  const it = ler(ITEM);
  const t = aplicar(ITEM, I.remendoResposta(it.perguntas[1].h, 'A agulha.'));
  assert.equal(t, ITEM.replace('A dor.', 'A agulha.'));
});

test('aprofundar esta: pode só com resposta, abaixo de 3 níveis e sem filha aberta; marca o código', () => {
  const it = ler(ITEM);
  assert.deepEqual(it.perguntas.map((_, k) => I.podeAprofundar(it, k)), [true, true, false, true]);
  const r = I.remendoAprofundar(it, 3);
  assert.deepEqual(r.fm, { pedido: 'aprofundar', aprofundar: I.codigoPergunta('Qual formato?') });
  const j = ler(aplicar(ITEM, r));
  assert.ok(I.aprofundando(j, 3) && !I.aprofundando(j, 0));
  assert.deepEqual(I.remendoCancelarAprofundar(j).fm, { pedido: null, aprofundar: null });
  const aberta = ler(ITEM.replace('Reel curto.\n', 'Reel curto.\n\n### ↳ Quanto dura?\n'));
  assert.equal(I.podeAprofundar(aberta, 3), false);
});

test('a filha nova entra logo depois do galho da mãe (simular no modo local)', () => {
  const pedido = aplicar(ITEM, I.remendoAprofundar(ler(ITEM), 0));
  const t = aplicar(pedido, I.exemploAprofundar(pedido, ler(pedido)));
  const it = ler(t);
  assert.deepEqual(it.perguntas.map(p => [p.nivel, p.mae]), [[1, -1], [2, 0], [3, 1], [2, 0], [1, -1]]);
  assert.match(it.perguntas[3].h, /^↳ Exemplo de seguimento 1/);
  assert.ok(t.includes('Costela.\n\n### ↳ Exemplo de seguimento 1'));
  assert.equal(it.campos.pedido, undefined);
  assert.equal(it.campos.aprofundar, undefined);
});

test('excluir uma mãe leva as filhas junto (todas descartadas); Desfazer devolve o arquivo exato', () => {
  const it = ler(ITEM);
  assert.deepEqual(I.galhoDe(it.perguntas, 0), [0, 1, 2]);
  const t = aplicar(ITEM, I.remendoExcluir(it, 'Quem assiste primeiro?'));
  const j = ler(t);
  assert.deepEqual(j.perguntas.map(p => p.q), ['Qual formato?']);
  assert.deepEqual(j.descartadas, ['Vai ter convidado?', 'Quem assiste primeiro?', 'Que medo aparece mais?', 'Em que parte do corpo?']);
  const galho = I.galhoDe(it.perguntas, 0).map(k => it.perguntas[k]);
  assert.equal(aplicar(t, I.remendoVolta(t, galho, 0)), ITEM);
  // excluir só a filha leva a neta, e a mãe fica
  const t2 = aplicar(ITEM, I.remendoExcluir(it, 'Que medo aparece mais?'));
  assert.deepEqual(ler(t2).perguntas.map(p => p.q), ['Quem assiste primeiro?', 'Qual formato?']);
  assert.equal(aplicar(t2, I.remendoVolta(t2, I.galhoDe(it.perguntas, 1).map(k => it.perguntas[k]), 1)), ITEM);
});
