// Reteste da Edição (30/10): o Claude que não responde, contas e textos, perguntas no lugar, tarefas de antes.
// Exemplos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicar, lerSecao, abrir } from '../js/formato.js';
import * as I from '../js/item.js';
import * as P from '../js/plano.js';

const ITEM = `---
titulo: Item de teste
origem: .
estado: edicao
criado: 2026-10-30
---

## Contexto

## Perguntas

### Quem assiste primeiro?
Quem nunca tatuou.

### ↳ Por que essa gente?
Têm medo.

### Qual é o prazo?

### Qual é o ritmo?

## Variáveis

### Decididas
- Formato: Reel de 30 s
- Prazo: a decidir

### Sugestões do Claude
- Canal: Instagram
- Ritmo: a combinar

## Plano

### A fazer
- Editar o piloto

### Fazendo
- Gravar o piloto

### Feito
- Escolher o fundo
`;
const ler = t => I.lerItem('ideias/youtube/x/decididas/y/item.md', t);

test('"a decidir" não conta como variável preenchida (mesmos valores do ferramentas.py)', () => {
  for (const v of ['a decidir', 'A decidir (sugestão: 3 semanas)', 'a combinar', 'Em aberto.', '?', '—', '', '  ']) assert.equal(I.aDecidir(v), true, v);
  for (const v of ['Reel de 30 s', 'decidir com o cliente até 10/11', '3 semanas', 'só tempo']) assert.equal(I.aDecidir(v), false, v);
  // Formato e Canal valem; Prazo ("a decidir", dele) e Ritmo ("a combinar", do Claude) não
  assert.equal(I.preenchidas(ler(ITEM)), 2);
});

test('rótulo do Enviar: cada parte separada por "·"', () => {
  assert.equal(I.rotuloEnvio({ respostas: 2, tiradas: 0, fora: true, rumo: false, algo: true }), 'Enviar respostas · 2 novas · descartadas mudaram');
  assert.equal(I.rotuloEnvio({ respostas: 1, tiradas: 1, fora: true, rumo: true, algo: true }), 'Enviar respostas · 1 nova · 1 apagada · rumo mudou');
  assert.equal(I.rotuloEnvio({ respostas: 0, tiradas: 0, fora: true, rumo: false, algo: false }), 'Enviar respostas');
});

test('excluir uma pergunta nunca respondida não liga o Enviar; uma respondida e enviada, sim', () => {
  let t = aplicar(ITEM, I.remendoEnviar(ler(ITEM)));
  t = aplicar(t, { fm: { pedido: null, enviando: null, enviadas: ler(t).enviando } });
  assert.equal(I.novidades(ler(t)).algo, false);
  const sem = aplicar(t, I.remendoExcluir(ler(t), 'Qual é o ritmo?'));
  assert.equal(I.novidades(ler(sem)).algo, false);
  const com = aplicar(t, I.remendoExcluir(ler(t), 'Quem assiste primeiro?'));
  assert.equal(I.novidades(ler(com)).algo, true);
});

test('o Claude não respondeu: o app lê "falhou:", pede de novo tudo junto ou tira o aviso', () => {
  const t = ITEM.replace('criado: 2026-10-30\n', 'criado: 2026-10-30\nfalhou: estrutura, respostas, aprofundar\naprofundar: 06278cfd\n');
  const it = ler(t);
  assert.deepEqual(it.falhou, ['estrutura', 'respostas', 'aprofundar']);
  assert.equal(I.nomePedido('estrutura'), 'Estrutura');
  assert.equal(I.nomePedido('respostas'), 'ler tuas respostas');
  // pedir de novo: as três voltam ao pedido, o envio leva a marca de agora e o aviso sai
  const r = I.remendoPedirDeNovo(it);
  assert.deepEqual(I.lerPedidos(r.fm.pedido), ['estrutura', 'respostas', 'aprofundar']);
  assert.equal(r.fm.falhou, null);
  assert.equal(r.fm.enviando, I.marcaDe(it));
  // pedir só uma pelo botão do cartão tira só ela do aviso
  assert.deepEqual(I.remendoPedir(it, 'estrutura').fm, { pedido: 'estrutura', falhou: 'respostas, aprofundar' });
  // deixar assim: tira o aviso e o código do aprofundar que ficou
  assert.deepEqual(I.remendoDeixarFalha(it).fm, { falhou: null, aprofundar: null });
  // aprofundar de outra pergunta não leva junto o código que sobrou do que falhou
  const a = I.remendoAprofundar(it, 2 - 1);
  assert.equal(a.fm.aprofundar, I.codigoPergunta('Por que essa gente?'));
  assert.equal(a.fm.falhou, 'estrutura, respostas');
});

test('trazer de volta: a pergunta volta ao lugar de onde saiu, no nível que tinha', () => {
  // a filha excluída volta embaixo da mãe, como filha
  const ex = aplicar(ITEM, I.remendoExcluir(ler(ITEM), 'Por que essa gente?'));
  assert.match(lerSecao(abrir(ex), ['Perguntas', 'Descartadas']), /^- Por que essa gente\?\n    <!-- lugar: depois=06278cfd nivel=2 -->\n    > Têm medo\.$/);
  assert.equal(aplicar(ex, I.remendoTrazer(ex, 0)), ITEM);
  // a do meio volta ao meio, mesmo com outra excluída depois
  let t = aplicar(ITEM, I.remendoExcluir(ler(ITEM), 'Qual é o prazo?'));
  t = aplicar(t, I.remendoExcluir(ler(t), 'Qual é o ritmo?'));
  t = aplicar(t, I.remendoTrazer(t, 0));
  assert.deepEqual(ler(t).perguntas.map(p => p.h), ['Quem assiste primeiro?', '↳ Por que essa gente?', 'Qual é o prazo?']);
  // a de cima sumiu: volta no fim, como raiz
  let u = aplicar(ITEM, I.remendoExcluir(ler(ITEM), 'Por que essa gente?'));
  u = aplicar(u, I.remendoExcluir(ler(u), 'Quem assiste primeiro?'));
  u = aplicar(u, I.remendoTrazer(u, 0));
  assert.deepEqual(ler(u).perguntas.map(p => p.h), ['Qual é o prazo?', 'Qual é o ritmo?', 'Por que essa gente?']);
});

test('tarefas do plano de antes: código igual ao ferramentas.py, marca e "ainda vale"', () => {
  assert.equal(I.codigoTarefa('Gravar o piloto'), '7691a953');
  assert.equal(I.codigoTarefa('  Gravar   o piloto '), '7691a953');
  const t = ITEM.replace('criado: 2026-10-30\n', `criado: 2026-10-30\nconferir: 7691a953 ${I.codigoTarefa('Escolher o fundo')}\n`);
  const it = ler(t);
  assert.equal(I.aConferir(it, it.plano.fazendo.tarefas[0]), true);
  assert.equal(I.aConferir(it, it.plano.afazer.tarefas[0]), false);
  assert.deepEqual(I.remendoVale(it, 'Gravar o piloto').fm, { conferir: I.codigoTarefa('Escolher o fundo') });
  assert.deepEqual(I.remendoVale(it, null).fm, { conferir: null });
  // modo local: refazer o plano desatualizado marca as que andavam; sem mudar de ideia, nada
  assert.equal(I.conferirDepois(ler(ITEM)), null);
  assert.equal(I.conferirDepois(ler(ITEM.replace('criado: 2026-10-30\n', 'criado: 2026-10-30\ndesatualizado: plano\n'))), `7691a953 ${I.codigoTarefa('Escolher o fundo')}`);
});

test('aviso do Kanban conta cada coluna', () => {
  const p = ler(ITEM).plano;
  assert.equal(P.avisoKanban(p), 'No Kanban: 1 tarefa em A fazer, 1 em Fazendo e 1 em Feito.');
  const so = P.vazio(); so.afazer = P.lerTarefas('- a\n- b');
  assert.equal(P.avisoKanban(so), 'No Kanban: 2 tarefas em A fazer.');
  so.feito = P.lerTarefas('- c');
  assert.equal(P.avisoKanban(so), 'No Kanban: 2 tarefas em A fazer e 1 em Feito.');
});
