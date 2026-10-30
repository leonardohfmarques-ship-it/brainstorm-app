// Melhorias de 30/10 (relatório dos testes da Edição), um bloco por pacote. Exemplos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrir, fechar, aplicar, lerSecao } from '../js/formato.js';
import * as I from '../js/item.js';

const ITEM = `---
titulo: Item de teste
origem: .
estado: edicao
criado: 2026-10-30
---

## Contexto

### Ideia · Ideia de teste

#### Lapidado
Texto de exemplo.

## Perguntas

### Quem assiste primeiro?
Quem nunca tatuou.

### Qual é o prazo?

### Qual é o ritmo?

## Variáveis

### Decididas
- Formato: Vídeo de 10 min

### Sugestões do Claude
- Prazo: 3 semanas

## Estrutura

## Riscos

## Versão final

## Plano

### A fazer

### Fazendo

### Feito
`;
const ler = t => I.lerItem('ideias/youtube/x/decididas/y/item.md', t);

/* ---------------- pacote 1 · o Claude não decide por ele ---------------- */
test('pacote 1: perguntas sem resposta contam para o aviso do Enviar', () => {
  assert.equal(fechar(abrir(ITEM)), ITEM);
  const it = ler(ITEM);
  assert.equal(I.semResposta(it), 2);
  assert.equal(I.semResposta(ler(aplicar(ITEM, I.remendoResposta('Qual é o prazo?', 'Até 20/11.')))), 1);
  // o palpite do Claude continua a valer como ponto de partida, marcado como dele
  assert.deepEqual(it.valem.Prazo, { valor: '3 semanas', de: 'claude' });
});

test('pacote 1: "Em aberto" do "O que entendi" sai à parte; o exemplo local fala do jeito dele', () => {
  assert.deepEqual(I.separarAberto('Tu quer um vídeo.\nPara quem nunca tatuou.\nEm aberto: Qual é o prazo? · Qual é o ritmo?'),
    { texto: 'Tu quer um vídeo.\nPara quem nunca tatuou.', aberto: 'Qual é o prazo? · Qual é o ritmo?' });
  assert.deepEqual(I.separarAberto('**Em aberto:** prazo.\nTu quer.'), { texto: 'Tu quer.', aberto: 'prazo.' });
  assert.deepEqual(I.separarAberto('Tu quer.'), { texto: 'Tu quer.', aberto: '' });
  const t0 = aplicar(ITEM, I.remendoEnviar(ler(ITEM)));
  const i1 = ler(aplicar(t0, I.exemploRespostas(ler(t0))));
  assert.match(i1.entendido, /^Exemplo do modo local: tu quer /);
  assert.doesNotMatch(i1.entendido, /tu queres/);
  assert.equal(I.separarAberto(i1.entendido).aberto, 'Qual é o prazo? · Qual é o ritmo?');
});
