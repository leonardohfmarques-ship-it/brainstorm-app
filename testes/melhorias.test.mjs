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

/* ---------------- pacote 2 · desatualizado é sério ---------------- */
const PRONTO = ITEM
  .replace('criado: 2026-10-30\n', 'criado: 2026-10-30\ndesatualizado: estrutura, plano\n')
  .replace('## Estrutura\n', '## Estrutura\n### 1. Gancho\nAbre.\n')
  .replace('## Riscos\n', '## Riscos\n- **Um:** cuidado.\n')
  .replace('## Versão final\n', '## Versão final\nTexto.\n')
  .replace('### A fazer\n', '### A fazer\n- Gravar o piloto\n');

test('pacote 2: desatualizado não conta como pronto (lista, passos, contagens)', () => {
  const it = ler(PRONTO);
  assert.equal(I.estadoFerramenta(it, 'plano'), 'pronto');     // o conteúdo está lá
  assert.equal(I.estadoCartao(it, 'plano'), 'velho');           // mas para a tela é desatualizado
  assert.equal(I.estadoCartao(it, 'versao'), 'pronto');
  assert.equal(I.prontas(it), 4);                               // perguntas, variáveis, riscos, versão
  assert.deepEqual(I.velhos(it), ['estrutura', 'plano']);
  assert.equal(I.estadoPasso(it, 'montar'), 'velho');
  assert.equal(I.estadoPasso(it, 'fechar'), 'velho');
  assert.equal(I.estadoPasso(it, 'aprofundar'), 'pronto');
  assert.deepEqual(I.fecharVelho(it), ['plano']);
  // pedido aberto ganha de desatualizado
  assert.equal(I.estadoPasso(ler(PRONTO.replace('desatualizado:', 'pedido: plano\ndesatualizado:')), 'fechar'), 'obras');
});

test('pacote 2: "manter assim" fica registrado e tira do aviso; respostas novas avisam de novo', () => {
  let t = aplicar(PRONTO, I.remendoManter(ler(PRONTO), 'plano'));
  let it = ler(t);
  assert.deepEqual([it.desatualizado, it.mantido], [['estrutura'], ['plano']]);
  assert.equal(I.estadoCartao(it, 'plano'), 'pronto');
  assert.deepEqual(I.fecharVelho(it), []);
  assert.equal(fechar(abrir(t)), t);
  // manter de novo não duplica
  assert.deepEqual(ler(aplicar(t, I.remendoManter(it, 'plano'))).mantido, ['plano']);
  // envio de respostas (o exemplo local faz como a Action): o plano volta a desatualizado e sai do "mantido"
  t = aplicar(t, I.remendoEnviar(ler(aplicar(t, I.remendoResposta('Qual é o prazo?', 'Até 20/11.')))));
  it = ler(aplicar(t, I.exemploRespostas(ler(t))));
  assert.ok(it.desatualizado.includes('plano'));
  assert.deepEqual(it.mantido, []);
});
