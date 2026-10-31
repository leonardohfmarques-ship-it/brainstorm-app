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

/* ---------------- pacote 3 · nada se perde e nada se gasta à toa ---------------- */
const GALHO = ITEM.replace('### Quem assiste primeiro?\nQuem nunca tatuou.\n',
  '### Quem assiste primeiro?\nQuem nunca tatuou.\n\n### ↳ Por que essa gente?\nTêm medo.\n\nE dúvida.\n\n### ↳↳ Medo de quê?\nDa dor.\n');

test('pacote 3: excluir guarda pergunta, resposta e galho; trazer de volta devolve tudo como estava', () => {
  const it = ler(GALHO);
  const ex = aplicar(GALHO, I.remendoExcluir(it, 'Quem assiste primeiro?'));
  assert.match(lerSecao(abrir(ex), ['Perguntas', 'Descartadas']),
    /^- Quem assiste primeiro\?\n    <!-- lugar: depois=inicio nivel=1 -->\n    > Quem nunca tatuou\.\n- ↳ Por que essa gente\?\n    > Têm medo\.\n    >\n    > E dúvida\.\n- ↳↳ Medo de quê\?\n    > Da dor\.$/);
  const i1 = ler(ex);
  assert.deepEqual(i1.descartadas, ['Quem assiste primeiro?', 'Por que essa gente?', 'Medo de quê?']);
  assert.equal(i1.descartes.length, 1);
  assert.deepEqual(i1.descartes[0].map(x => [x.q, x.r, x.nivel]), [['Quem assiste primeiro?', 'Quem nunca tatuou.', 1], ['Por que essa gente?', 'Têm medo.\n\nE dúvida.', 2], ['Medo de quê?', 'Da dor.', 3]]);
  assert.equal(fechar(abrir(ex)), ex);
  // Desfazer devolve o arquivo exato
  assert.equal(aplicar(ex, I.remendoVolta(ex, I.galhoDe(it.perguntas, 0).map(k => it.perguntas[k]), 0)), GALHO);
  // trazer de volta (depois do Desfazer acabar): o galho volta inteiro, com as respostas, no lugar de onde saiu
  const tr = aplicar(ex, I.remendoTrazer(ex, 0));
  const i2 = ler(tr);
  assert.deepEqual(i2.perguntas.map(p => [p.h, p.r, p.nivel]), [
    ['Quem assiste primeiro?', 'Quem nunca tatuou.', 1], ['↳ Por que essa gente?', 'Têm medo.\n\nE dúvida.', 2], ['↳↳ Medo de quê?', 'Da dor.', 3],
    ['Qual é o prazo?', '', 1], ['Qual é o ritmo?', '', 1]]);
  assert.equal(tr, GALHO);
  assert.deepEqual(i2.descartadas, []);
  assert.ok(!tr.includes('### Descartadas'));
  // excluir só a filha: guarda relativo a ela (vira raiz do grupo); o resto das descartadas não perde a resposta
  const ex2 = aplicar(ex, I.remendoExcluir(ler(ex), 'Qual é o prazo?'));
  const i3 = ler(aplicar(ex2, I.remendoTrazer(ex2, 1)));
  assert.deepEqual(i3.descartes[0].map(x => x.r), ['Quem nunca tatuou.', 'Têm medo.\n\nE dúvida.', 'Da dor.']);
  const f = ler(aplicar(tr, I.remendoExcluir(ler(tr), 'Por que essa gente?')));
  assert.deepEqual(f.descartes[0].map(x => [x.h, x.nivel]), [['Por que essa gente?', 1], ['↳ Medo de quê?', 2]]);
});

test('pacote 3: Descartadas antigas (só títulos) continuam a funcionar', () => {
  const velho = ITEM.replace('## Variáveis', '### Descartadas\n- Uma antiga?\n- Outra antiga?\n\n## Variáveis');
  const it = ler(velho);
  assert.deepEqual(it.descartadas, ['Uma antiga?', 'Outra antiga?']);
  assert.deepEqual(it.descartes.map(g => g.map(x => [x.q, x.r])), [[['Uma antiga?', '']], [['Outra antiga?', '']]]);
  const t = aplicar(velho, I.remendoTrazer(velho, 1));
  assert.deepEqual(ler(t).perguntas.at(-1).q, 'Outra antiga?');
  assert.equal(lerSecao(abrir(t), ['Perguntas', 'Descartadas']), '- Uma antiga?');
  // a pergunta dele com o nome de uma descartada tira só aquela
  const n = aplicar(velho, I.remendoNova(it, 'Uma antiga?', 'Agora sim.'));
  assert.deepEqual(ler(n).descartadas, ['Outra antiga?']);
});

test('pacote 3: apagar, excluir ou trazer de volta liga o Enviar (mesmos valores do ferramentas.py)', () => {
  assert.equal(I.codigoFora([]), 'd0a4014b');
  assert.equal(I.codigoFora(['Vai ter convidado especial?']), '394709f6');
  assert.equal(I.codigoFora(['Qual é a cor favorita?', 'Vai ter música / trilha?']), 'fe14db81');
  let t = aplicar(GALHO, I.remendoEnviar(ler(GALHO)));
  t = aplicar(t, { fm: { pedido: null, enviando: null, enviadas: ler(t).enviando } });
  assert.equal(I.novidades(ler(t)).algo, false);
  // apagar uma resposta enviada
  const nv1 = I.novidades(ler(aplicar(t, I.remendoResposta('↳↳ Medo de quê?', ''))));
  assert.deepEqual([nv1.algo, nv1.tiradas, nv1.respostas], [true, 1, 0]);
  // mudar não é apagar
  const nv2 = I.novidades(ler(aplicar(t, I.remendoResposta('↳↳ Medo de quê?', 'Da agulha.'))));
  assert.deepEqual([nv2.respostas, nv2.tiradas], [1, 0]);
  // excluir uma sem resposta mexe nas descartadas, mas não liga o Enviar (reteste de 30/10: nada do que o Claude leu mudou)
  const ex = aplicar(t, I.remendoExcluir(ler(t), 'Qual é o ritmo?'));
  assert.deepEqual([I.novidades(ler(ex)).fora, I.novidades(ler(ex)).algo], [true, false]);
  // trazer de volta: volta ao que foi enviado
  assert.equal(I.novidades(ler(aplicar(ex, I.remendoTrazer(ex, 0)))).algo, false);
  // marca antiga (sem "fora="): as descartadas não contam
  const antigo = ex.replace(/enviadas: rumo=(\w+) fora=\w+ /, 'enviadas: rumo=$1 ');
  assert.equal(I.novidades(ler(antigo)).fora, false);
});

test('pacote 3: pergunta dele fica marcada (minhas:) e "Mais perguntas" trava com 3 abertas', () => {
  const it = ler(ITEM);
  const r = I.remendoNova(it, 'Pergunta minha?', 'Sim.');
  assert.equal(r.fm.minhas, I.codigoPergunta('Pergunta minha?'));
  const t = aplicar(ITEM, r);
  assert.deepEqual(ler(t).minhas, [I.codigoPergunta('Pergunta minha?')]);
  assert.equal(I.ABERTAS_LIMITE, 3);
  assert.equal(I.semResposta(ler(t)), 2);
});

/* ---------- pacote 4: produto, projeto e celular ---------- */
import * as P from '../js/plano.js';
import { Store, mesmosTextos } from '../js/sync.js';

test('pacote 4: tipo da peça, o dele vence o palpite do Claude', () => {
  assert.equal(I.lerTipo('Produto.'), 'produto');
  assert.equal(I.lerTipo('conteúdo'), 'conteudo');
  assert.equal(I.lerTipo('sei lá'), '');
  let it = I.lerItem('ideias/youtube/x/decididas/y/item.md', ITEM);
  assert.deepEqual(it.tipo, { valor: '', de: '' });
  assert.equal(I.nomeVar('Custo', it.tipo.valor), 'Custo');
  let txt = aplicar(ITEM, { fm: { 'tipo-sugerido': 'produto' } });
  it = I.lerItem('ideias/youtube/x/decididas/y/item.md', txt);
  assert.deepEqual(it.tipo, { valor: 'produto', de: 'claude' });
  assert.equal(I.nomeVar('Custo', it.tipo.valor), 'Custo e preço');
  assert.equal(I.nomeVar('Prazo', it.tipo.valor), 'Prazo');
  txt = aplicar(txt, I.remendoTipo('projeto'));
  it = I.lerItem('ideias/youtube/x/decididas/y/item.md', txt);
  assert.deepEqual(it.tipo, { valor: 'projeto', de: 'dele' });
  assert.match(txt, /\ntipo: projeto\n/);
  assert.match(txt, /\ntipo-sugerido: produto\n/);
  // vazio no seletor: volta a valer o palpite
  txt = aplicar(txt, I.remendoTipo(''));
  assert.doesNotMatch(txt, /\ntipo: /);
  assert.deepEqual(I.lerItem('ideias/youtube/x/decididas/y/item.md', txt).tipo, { valor: 'produto', de: 'claude' });
  // o modo local também deixa um palpite
  assert.equal(I.exemploRespostas(I.lerItem('ideias/youtube/x/decididas/y/item.md', ITEM)).fm['tipo-sugerido'], 'conteudo');
});

test('pacote 4: tarefa com título curto e detalhe embaixo', () => {
  const col = P.lerTarefas('- Pedir orçamento a três fornecedores\n  Perguntar o preço por unidade.\n  - e o prazo\n- Testar no 1º dia');
  assert.deepEqual(col.tarefas.map(t => t.texto), ['Pedir orçamento a três fornecedores', 'Testar no 1º dia']);
  assert.deepEqual(P.detalhe(col.tarefas[0]), ['Perguntar o preço por unidade.', 'e o prazo']);
  assert.deepEqual(P.detalhe(col.tarefas[1]), []);
  // mover leva o detalhe junto
  const p = P.mover({ afazer: col, fazendo: P.lerTarefas(''), feito: P.lerTarefas('') }, { col: 'afazer', i: 0 }, { col: 'feito', i: 0 });
  assert.deepEqual(P.detalhe(p.feito.tarefas[0]), ['Perguntar o preço por unidade.', 'e o prazo']);
});

test('pacote 4: buscar de novo só redesenha quando algum texto mudou', async () => {
  const arq = 'ideias/youtube/x/decididas/y/item.md';
  let rev = 'a', texto = ITEM;
  const b = { load: async () => ({ files: new Map([[arq, { text: texto, sha: rev }]]), anexos: [], rev, truncado: false }) };
  const s = new Store(b); await s.carregar();
  let avisos = 0; s.on(t => { if (t === 'remoto') avisos++; });
  rev = 'b';  // commit novo (o vigia, o nosso envio) sem mudar o texto
  assert.equal(await s.atualizar(), false);
  assert.equal(s.rev, 'b');
  assert.equal(s.files.get(arq).sha, 'b', 'o sha novo fica guardado para o próximo envio');
  assert.equal(avisos, 0);
  rev = 'c'; texto = ITEM.replace('Quem nunca tatuou.', 'Quem já tatuou.');  // o Claude respondeu
  assert.equal(await s.atualizar(), true);
  assert.equal(avisos, 1);
  assert.equal(mesmosTextos(new Map([['a', { text: '1' }]]), new Map([['a', { text: '1' }], ['b', { text: '' }]])), false);
});
