// Edição em passos (Aprofundar → Montar → Fechar) e as variáveis já aceitas. Exemplos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrir, fechar, aplicar, lerSecao } from '../js/formato.js';
import * as I from '../js/item.js';

// os mesmos valores estão em sistema/test_ferramentas.py (repositório brainstorm): o app e a Action contam igual
const COM_VARS = `---
titulo: Item de teste
origem: .
estado: edicao
criado: 2026-10-29
passo: montar
pedido: estrutura, variaveis
---

## Contexto

### Ideia · Ideia de teste

#### Lapidado
Texto de exemplo.

## Perguntas

### Quem assiste primeiro?
Quem nunca tatuou.

## Variáveis

### Decididas
- Formato: Reel de 30 s
- Canal:
- Prazo:   
- Ritmo: 1 por semana
- Outra coisa: livre

### Sugestões do Claude
- Formato: vídeo longo
- Canal: Instagram
- Prazo: 2 semanas
- Custo: só tempo

## Estrutura

## Riscos
`;
const VALEM = {
  Formato: { valor: 'Reel de 30 s', de: 'dele' }, Canal: { valor: 'Instagram', de: 'claude' }, Prazo: { valor: '2 semanas', de: 'claude' },
  Ritmo: { valor: '1 por semana', de: 'dele' }, Custo: { valor: 'só tempo', de: 'claude' }, Material: { valor: '', de: '' }
};
const ler = t => I.lerItem('ideias/youtube/x/decididas/y/item.md', t);
const SEM_PASSO = COM_VARS.replace('passo: montar\n', '');

test('valor que vale: o dele; onde ele não escreveu, a sugestão do Claude (mesma conta do ferramentas.py)', () => {
  assert.equal(fechar(abrir(COM_VARS)), COM_VARS);
  const it = ler(COM_VARS);
  assert.deepEqual(it.valem, VALEM);
  // as duas partes continuam lidas como antes, separadas
  assert.equal(it.variaveis.Canal, '');
  assert.equal(it.sugestoes.Canal, 'Instagram');
  assert.deepEqual(it.varExtras, ['- Outra coisa: livre']);
  // só espaços conta como vazio; sem sugestão e sem a dele fica em aberto
  assert.deepEqual(I.valem({ Formato: '   ' }, { Formato: ' Reel ' }).Formato, { valor: 'Reel', de: 'claude' });
  assert.deepEqual(I.valem({}, {}).Material, { valor: '', de: '' });
  assert.deepEqual(I.valem({ Prazo: 'sexta' }, { Prazo: '2 semanas' }).Prazo, { valor: 'sexta', de: 'dele' });
});

test('variáveis: editar grava só a dele em Decididas; apagar volta a valer a do Claude; nada do Claude entra lá', () => {
  const it = ler(COM_VARS);
  // ele escreve por cima da do Claude em Canal (o app manda as dele, com a que mudou)
  const t1 = aplicar(COM_VARS, I.remendoVariaveis(Object.assign({}, it.variaveis, { Canal: 'YouTube e Reels' }), it.varExtras));
  const i1 = ler(t1);
  assert.deepEqual(i1.valem.Canal, { valor: 'YouTube e Reels', de: 'dele' });
  assert.equal(lerSecao(abrir(t1), ['Variáveis', 'Decididas']), '- Formato: Reel de 30 s\n- Canal: YouTube e Reels\n- Prazo:\n- Ritmo: 1 por semana\n- Custo:\n- Material:\n- Outra coisa: livre');
  assert.equal(lerSecao(abrir(t1), ['Variáveis', 'Sugestões do Claude']), lerSecao(abrir(COM_VARS), ['Variáveis', 'Sugestões do Claude']));
  // ele apaga o que escreveu: volta a valer a do Claude, e as sugestões não foram copiadas para Decididas
  const t2 = aplicar(t1, I.remendoVariaveis(Object.assign({}, i1.variaveis, { Canal: '' }), i1.varExtras));
  const i2 = ler(t2);
  assert.deepEqual(i2.valem, Object.assign({}, VALEM));
  assert.ok(!/- Prazo: 2 semanas/.test(lerSecao(abrir(t2), ['Variáveis', 'Decididas'])));
  assert.equal(t2.replace('### Decididas\n- Formato: Reel de 30 s\n- Canal:\n- Prazo:\n- Ritmo: 1 por semana\n- Custo:\n- Material:\n', ''),
    COM_VARS.replace('### Decididas\n- Formato: Reel de 30 s\n- Canal:\n- Prazo:   \n- Ritmo: 1 por semana\n', ''));
  // "Sugerir de novo" (a Action) troca só as sugestões: o que é dele fica, o resto passa a valer a nova
  const t3 = aplicar(t1, { sec: { [I.SEC_SUGESTOES]: '- Formato: Short\n- Canal: Instagram\n- Prazo: 3 semanas\n- Material: celular' } });
  const i3 = ler(t3);
  assert.deepEqual([i3.valem.Formato.valor, i3.valem.Canal.valor, i3.valem.Prazo.valor, i3.valem.Material.valor], ['Reel de 30 s', 'YouTube e Reels', '3 semanas', 'celular']);
  assert.equal(lerSecao(abrir(t3), ['Variáveis', 'Decididas']), lerSecao(abrir(t1), ['Variáveis', 'Decididas']));
  // o cartão conta as que valem
  assert.equal(I.VARIAVEIS.filter(k => i3.valem[k].valor).length, 5);
  assert.equal(I.estadoFerramenta(ler(aplicar(COM_VARS, { fm: { pedido: null }, sec: { [I.SEC_SUGESTOES]: null } })), 'variaveis'), 'pronto'); // as dele bastam
});

test('passo guardado no arquivo: sem a linha é Aprofundar; abrir outro grava só "passo:"; voltar ao começo tira a linha', () => {
  assert.equal(ler(SEM_PASSO).passo, 'aprofundar');
  assert.equal(ler(COM_VARS).passo, 'montar');
  assert.equal(ler(COM_VARS.replace('passo: montar', 'passo: Fechar ')).passo, 'fechar');
  assert.equal(ler(COM_VARS.replace('passo: montar', 'passo: outro')).passo, 'aprofundar');
  assert.deepEqual(I.PASSOS.map(p => p.id), ['aprofundar', 'montar', 'fechar']);
  assert.deepEqual(I.PRINCIPAIS, ['perguntas', 'variaveis', 'estrutura', 'riscos', 'versao', 'plano']);
  assert.deepEqual(I.EXTRAS, ['referencias', 'comparar']);
  // abrir Montar e depois Fechar: só a linha do passo muda; voltar a Aprofundar devolve o arquivo exato
  const t1 = aplicar(SEM_PASSO, I.remendoPasso('montar'));
  assert.equal(t1, SEM_PASSO.replace('pedido: estrutura, variaveis\n', 'pedido: estrutura, variaveis\npasso: montar\n'));
  const t2 = aplicar(t1, I.remendoPasso('fechar'));
  assert.equal(t2, t1.replace('passo: montar', 'passo: fechar'));
  assert.equal(aplicar(t2, I.remendoPasso('aprofundar')), SEM_PASSO);
  assert.deepEqual(I.remendoPasso('qualquer'), { fm: { passo: null } });
  // o passo não mexe em nada das ferramentas
  assert.deepEqual(ler(t2).valem, ler(SEM_PASSO).valem);
  assert.deepEqual(ler(t2).pedidos, ['estrutura', 'variaveis']);
});

test('estado de cada passo pelos cartões dele: em obras, pronto, meio ou vazio', () => {
  const it = ler(COM_VARS);
  assert.equal(I.estadoPasso(it, 'aprofundar'), 'obras');       // variáveis pedidas
  assert.equal(I.estadoPasso(it, 'montar'), 'obras');           // estrutura pedida
  assert.equal(I.estadoPasso(it, 'fechar'), 'vazio');
  const pronto = ler(aplicar(COM_VARS, { fm: { pedido: null }, sec: { Estrutura: '### 1. Gancho\nAbre.', 'Versão final': 'Texto.' } }));
  assert.equal(I.estadoPasso(pronto, 'aprofundar'), 'pronto');
  assert.equal(I.estadoPasso(pronto, 'montar'), 'meio');        // estrutura pronta, riscos vazios
  assert.equal(I.estadoPasso(pronto, 'fechar'), 'meio');
  const todos = ler(aplicar(COM_VARS, { fm: { pedido: null }, sec: { Estrutura: 'x', Riscos: '- y', 'Versão final': 'z', 'Plano/A fazer': '- fazer' } }));
  assert.deepEqual(I.PASSOS.map(p => I.estadoPasso(todos, p.id)), ['pronto', 'pronto', 'pronto']);
});
