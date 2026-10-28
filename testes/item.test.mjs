// Edição por item: decidir na ponta, contexto congelado, ferramentas e pedidos. Exemplos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrir, fechar, aplicar, lerSecao, secao, descer, juntar } from '../js/formato.js';
import { construir, ehTexto } from '../js/modelo.js';
import { noPorRel } from '../js/arvore.js';
import * as I from '../js/item.js';
import { mensagem } from '../js/sync.js';

const IDEIA = `---
titulo: Ideia de exemplo
area: youtube
estado: ativa
criada: 2026-10-20
codigo: YT-900
---

## Bruto

### Fala
> Uma fala de exemplo.

_20/10/2026_

### Anotações
Nota dele na ideia.

## Lapidado

### Resumo
Resumo de exemplo.

### Brainstorm

#### O que faz funcionar
- Um ponto.
`;
const dir = (t, o, lap, notas = '') => `---\ntitulo: ${t}\nordem: ${o}\n---\n\n## Bruto\n\n### Anotações\n${notas}\n\n## Lapidado\n${lap}\n`;
const B = 'ideias/youtube/exemplo';
function arquivos(extra = {}) {
  return new Map(Object.entries(Object.assign({
    [`${B}/ideia.md`]: IDEIA,
    [`${B}/direcoes/a/direcao.md`]: dir('Primeira', 1, 'Texto A.'),
    [`${B}/direcoes/b/direcao.md`]: dir('Segunda', 2, 'Texto B.'),
    [`${B}/direcoes/b/direcoes/b1/direcao.md`]: dir('Dentro da segunda', 1, 'Texto B1.\n\n### Detalhe\nMais.', 'Nota em B1.'),
    [`${B}/direcoes/b/direcoes/b1/direcoes/ponta/direcao.md`]: dir('A ponta: um tema', 1, 'Texto da ponta.'),
    [`${B}/direcoes/b/direcoes/b1/direcoes/irma/direcao.md`]: dir('Irmã da ponta', 2, 'Texto da irmã.')
  }, extra)).map(([p, text]) => [p, { text }]));
}
const cadeia = (m, rel) => { const ideia = m.ideias[0]; const out = [ideia]; let n = ideia; for (const s of rel.split('/')) { n = n.direcoes.find(d => d.slug === s); out.push(n); } return out; };

const COMPLETO = `---
titulo: Um item: completo
origem: direcoes/b/direcoes/b1
estado: edicao
criado: 2026-10-27
pedido: estrutura, riscos
---

## Contexto

### Ideia · Ideia de exemplo

#### Fala

> Uma fala de exemplo.

#### Lapidado

##### Resumo
Resumo de exemplo.

### Nível 1 · Segunda

#### Lapidado

Texto B.

## Perguntas

### Quem assiste primeiro?
Gente que vai fazer a primeira tattoo.

### Precisa de convidado / parceiro?

## Variáveis

### Decididas
- Formato: vídeo de 12 min
- Canal: YouTube
- Prazo:
- Ritmo:
- Custo:
- Material: fotos
- Outra coisa: livre

### Sugestões do Claude
- Prazo: 2 semanas

## Estrutura

### 1. Gancho
Abre forte.

## Riscos
- **Imagem:** citar a fonte.

## Referências
- https://exemplo.com/a

## Comparar

### Primeira
Vale puxar a abertura.

## Versão final
Texto fechado.

## Plano

### A fazer
- Primeira tarefa

### Fazendo

### Feito
- Tarefa feita
`;

test('item.md com todas as seções: ida e volta exata e leitura de cada ferramenta', () => {
  assert.equal(fechar(abrir(COMPLETO)), COMPLETO);
  assert.equal(aplicar(COMPLETO, { fm: {}, sec: {} }), COMPLETO);
  const it = I.lerItem(`${B}/decididas/b1/item.md`, COMPLETO);
  assert.equal(it.titulo, 'Um item: completo');
  assert.equal(it.rel, 'b/b1');
  assert.deepEqual(it.pedidos, ['estrutura', 'riscos']);
  assert.equal(it.contexto.length, 2);
  assert.equal(it.contexto[0].rotulo, 'Ideia');
  assert.equal(it.contexto[0].fala, '> Uma fala de exemplo.');
  assert.equal(it.contexto[1].titulo, 'Segunda');
  assert.deepEqual(it.perguntas.map(p => p.q), ['Quem assiste primeiro?', 'Precisa de convidado / parceiro?']);
  assert.equal(it.perguntas[0].r, 'Gente que vai fazer a primeira tattoo.');
  assert.equal(it.variaveis.Formato, 'vídeo de 12 min');
  assert.equal(it.variaveis.Prazo, '');
  assert.deepEqual(it.varExtras, ['- Outra coisa: livre']);
  assert.equal(it.sugestoes.Prazo, '2 semanas');
  assert.equal(I.blocos(it.estrutura).blocos[0].titulo, '1. Gancho');
  assert.equal(it.versao, 'Texto fechado.');
  assert.equal(it.plano.afazer.tarefas[0].texto, 'Primeira tarefa');
  assert.equal(it.plano.feito.tarefas.length, 1);
  assert.equal(I.estadoFerramenta(it, 'estrutura'), 'obras');
  assert.equal(I.estadoFerramenta(it, 'comparar'), 'pronto');
  // escrever uma ferramenta não mexe em nenhuma outra linha
  const novo = aplicar(COMPLETO, { sec: { Riscos: '- outro risco' } });
  assert.equal(novo, COMPLETO.replace('- **Imagem:** citar a fonte.', '- outro risco'));
});

test('decidir uma ponta de nível 3: item novo com o contexto congelado do caminho inteiro', () => {
  const m = construir(arquivos());
  const c = cadeia(m, 'b/b1/ponta');
  const r = I.novoItem({ cadeia: c, usados: [], hoje: '2026-10-27' });
  assert.equal(r.path, `${B}/decididas/ponta/item.md`);
  assert.equal(r.rel, 'b/b1/ponta');
  const it = I.lerItem(r.path, r.text);
  assert.equal(it.titulo, 'A ponta: um tema');
  assert.equal(it.origem, 'direcoes/b/direcoes/b1/direcoes/ponta');
  assert.equal(it.estado, 'edicao');
  assert.equal(it.criado, '2026-10-27');
  assert.deepEqual(it.contexto.map(x => [x.rotulo, x.titulo]), [['Ideia', 'Ideia de exemplo'], ['Nível 1', 'Segunda'], ['Nível 2', 'Dentro da segunda'], ['Nível 3', 'A ponta: um tema']]);
  assert.match(it.contexto[0].fala, /Uma fala de exemplo/);
  assert.equal(it.contexto[0].anotacoes, 'Nota dele na ideia.');
  assert.match(it.contexto[0].lapidado, /^##### Resumo/m);       // títulos do lapidado descem, sem quebrar o item
  assert.match(it.contexto[0].lapidado, /^###### O que faz funcionar/m);
  assert.equal(it.contexto[2].anotacoes, 'Nota em B1.');
  assert.match(it.contexto[2].lapidado, /##### Detalhe/);
  assert.equal(it.contexto[3].lapidado, 'Texto da ponta.');
  // todas as seções nascem vazias, na ordem
  const doc = abrir(r.text);
  assert.equal(lerSecao(doc, ['Perguntas']), '');
  assert.equal(lerSecao(doc, ['Plano', 'A fazer']), '');
  assert.deepEqual(it.variaveis, { Formato: '', Canal: '', Prazo: '', Ritmo: '', Custo: '', Material: '' });
  // no modelo: a ideia continua ativa e a ponta sabe do item
  const m2 = construir(arquivos({ [r.path]: r.text }));
  const ideia = m2.ideias[0];
  assert.equal(ideia.estado, 'ativa');
  assert.equal(m2.itens.length, 1);
  assert.equal(m2.itens[0].key, 'youtube/exemplo/decididas/ponta');
  assert.equal(noPorRel(ideia, 'b/b1/ponta').itens[0], m2.itens[0]);
  assert.equal(m2.itens[0].no, noPorRel(ideia, 'b/b1/ponta'));
  assert.equal(m2.itens[0].codigo, 'YT-900');
  // decidir de novo a mesma ponta (depois de concluída) não sobrescreve: slug novo
  assert.equal(I.novoItem({ cadeia: c, usados: ['ponta'], hoje: '2026-10-28' }).path, `${B}/decididas/ponta-2/item.md`);
  // a ideia inteira também pode ser decidida
  const ri = I.novoItem({ cadeia: [m.ideias[0]], hoje: '2026-10-27' });
  assert.equal(I.lerItem(ri.path, ri.text).origem, '.');
  assert.equal(I.lerItem(ri.path, ri.text).rel, '');
});

test('contexto congelado: apagar a direção depois não quebra o item', () => {
  const m = construir(arquivos());
  const r = I.novoItem({ cadeia: cadeia(m, 'b/b1/ponta'), hoje: '2026-10-27' });
  const f = arquivos({ [r.path]: r.text });
  for (const p of [...f.keys()]) if (p.includes('/direcoes/b/')) f.delete(p);
  const m2 = construir(f);
  assert.equal(m2.erros.length, 0);
  const it = m2.itens[0];
  assert.equal(it.no, null);
  assert.equal(it.contexto.length, 4);
  assert.equal(it.contexto[3].lapidado, 'Texto da ponta.');
});

test('pedidos das ferramentas: marcar, juntar dois, cancelar, nome desconhecido', () => {
  assert.deepEqual(I.lerPedidos('perguntas, riscos'), ['perguntas', 'riscos']);
  assert.deepEqual(I.lerPedidos('Perguntas,comparar  desenvolver'), ['perguntas', 'comparar']);
  assert.deepEqual(I.lerPedidos(''), []);
  assert.equal(I.comPedido([], 'perguntas'), 'perguntas');
  assert.equal(I.comPedido(['perguntas'], 'plano'), 'perguntas, plano');
  assert.equal(I.comPedido(['perguntas'], 'perguntas'), 'perguntas');
  assert.equal(I.comPedido(['perguntas', 'plano'], 'perguntas', false), 'plano');
  assert.equal(I.comPedido(['plano'], 'plano', false), null);
  assert.equal(I.comPedido([], 'contexto'), null);
  // no arquivo: só a linha do pedido muda; tirar o último apaga a linha
  const um = aplicar(COMPLETO, { fm: { pedido: I.comPedido(['estrutura', 'riscos'], 'plano') } });
  assert.match(um, /^pedido: estrutura, riscos, plano$/m);
  const sem = aplicar(COMPLETO, { fm: { pedido: null } });
  assert.equal(sem, COMPLETO.replace('pedido: estrutura, riscos\n', ''));
  assert.equal(I.estadoFerramenta(I.lerItem('x/item.md', sem), 'estrutura'), 'pronto');
  // a automação acorda pela mensagem: o pedido não some quando junta com outras mudanças
  assert.equal(mensagem(['App: variáveis de "X"', 'App: pede ao Claude "Ver riscos" em "X"', 'App: variáveis de "X"']), 'App: pede ao Claude "Ver riscos" em "X" (e mais 1)');
  assert.equal(mensagem(['App: a', 'App: b']), 'App: b (e mais 1)');
});

test('respostas e variáveis: o app grava só o que é dele, mesmo com "/" na pergunta', () => {
  const r1 = aplicar(COMPLETO, I.remendoResposta('Precisa de convidado / parceiro?', 'Não.\n# título dele'));
  const it = I.lerItem('x/item.md', r1);
  assert.equal(it.perguntas[1].r, 'Não.\n#### título dele');
  assert.equal(it.perguntas.length, 2);
  assert.equal(it.perguntas[0].r, 'Gente que vai fazer a primeira tattoo.');
  const r2 = aplicar(COMPLETO, I.remendoVariaveis({ Formato: 'Reel', Canal: 'Instagram', Prazo: 'sexta' }, ['- Outra coisa: livre']));
  const it2 = I.lerItem('x/item.md', r2);
  assert.equal(it2.variaveis.Prazo, 'sexta');
  assert.equal(it2.variaveis.Material, '');
  assert.equal(it2.sugestoes.Prazo, '2 semanas');            // a sugestão do Claude fica intacta
  assert.deepEqual(it2.varExtras, ['- Outra coisa: livre']);
  assert.equal(lerSecao(abrir(r2), ['Estrutura']), '### 1. Gancho\nAbre forte.');
  // seção que faltava nasce no lugar certo da ordem
  const semRiscos = COMPLETO.replace('## Riscos\n- **Imagem:** citar a fonte.\n\n', '');
  const volta = aplicar(semRiscos, { sec: { Riscos: '- novo' } });
  assert.ok(volta.indexOf('## Riscos') > volta.indexOf('## Estrutura') && volta.indexOf('## Riscos') < volta.indexOf('## Referências'));
  assert.equal(secao('Perguntas', 'a/b').split('\u001f').length, 2);
  assert.equal(descer('### A\n#### B', 5), '##### A\n###### B');
  assert.equal(descer('##### A', 5), '##### A');
});

test('compatibilidade: ideia no jeito antigo (estado edicao/kanban) continua igual ao lado dos itens', () => {
  const ANTIGA = IDEIA.replace('estado: ativa', 'estado: kanban') + `
## Edição

### Escolhas
- Formato: Reel

### Versão final
Antiga.

## Plano

### A fazer
- Tarefa antiga

### Fazendo

### Feito
`;
  const r = I.novoItem({ cadeia: cadeia(construir(arquivos()), 'a'), hoje: '2026-10-27' });
  const m = construir(arquivos({ [`${B}/ideia.md`]: ANTIGA, [r.path]: r.text }));
  const ideia = m.ideias[0];
  assert.equal(ideia.estado, 'kanban');
  assert.equal(ideia.plano.afazer.tarefas[0].texto, 'Tarefa antiga');
  assert.equal(ideia.edicao.versao, 'Antiga.');
  assert.equal(m.itens.length, 1);
  assert.equal(m.itens[0].estado, 'edicao');
  assert.equal(aplicar(ANTIGA, { fm: {}, sec: {} }), ANTIGA);
  // o app lê item.md e continua sem ler o resto como texto
  assert.ok(ehTexto(`${B}/decididas/x/item.md`));
  assert.ok(ehTexto(`${B}/ideia.md`) && ehTexto(`${B}/direcoes/a/direcao.md`));
  assert.ok(!ehTexto(`${B}/decididas/x/anexos/foto.png`));
  assert.ok(!ehTexto(`${B}/anexos/item.md`));
  // item fora de uma ideia que existe é ignorado (vai para erros), sem derrubar o resto
  const m3 = construir(arquivos({ 'ideias/youtube/sumiu/decididas/x/item.md': r.text }));
  assert.equal(m3.itens.length, 0);
  assert.equal(m3.erros.length, 1);
});

/* ---------------- Perguntas: rumo dele, excluir com desfazer, descartadas, pergunta dele ---------------- */
const COM_RUMO = COMPLETO.replace('## Perguntas\n\n', `## Perguntas

### Para onde eu quero
Quero que vire uma série curta, sem convidado.

#### Nota dele
Um detalhe.

`).replace('### Precisa de convidado / parceiro?\n', `### Precisa de convidado / parceiro?

### Descartadas
- Qual é a cor favorita?
- Vai ter música / trilha?
`);

test('rumo e descartadas: ida e volta exata e leitura (perguntas não incluem as duas subseções)', () => {
  assert.equal(fechar(abrir(COM_RUMO)), COM_RUMO);
  assert.equal(aplicar(COM_RUMO, { fm: {}, sec: {} }), COM_RUMO);
  const it = I.lerItem('x/item.md', COM_RUMO);
  assert.deepEqual(it.perguntas.map(p => p.q), ['Quem assiste primeiro?', 'Precisa de convidado / parceiro?']);
  assert.equal(it.rumo, 'Quero que vire uma série curta, sem convidado.\n\n#### Nota dele\nUm detalhe.');
  assert.deepEqual(it.descartadas, ['Qual é a cor favorita?', 'Vai ter música / trilha?']);
  assert.equal(it.perguntas[1].r, '');
  // arquivo de antes (sem as duas subseções) lê igual
  const velho = I.lerItem('x/item.md', COMPLETO);
  assert.equal(velho.rumo, '');
  assert.deepEqual(velho.descartadas, []);
  assert.equal(velho.perguntas.length, 2);
  // responder uma pergunta não mexe no rumo nem nas descartadas
  const r = aplicar(COM_RUMO, I.remendoResposta('Precisa de convidado / parceiro?', 'Não.'));
  assert.equal(r, COM_RUMO.replace('### Precisa de convidado / parceiro?\n', '### Precisa de convidado / parceiro?\nNão.\n'));
});

test('campo livre (para onde eu quero): nasce no começo de Perguntas, grava o texto dele como está', () => {
  const r1 = aplicar(COMPLETO, I.remendoRumo('Quero levar para uma série.\n# do meu jeito'));
  const i1 = I.lerItem('x/item.md', r1);
  assert.equal(i1.rumo, 'Quero levar para uma série.\n#### do meu jeito');
  assert.ok(r1.indexOf('### Para onde eu quero') > r1.indexOf('## Perguntas'));
  assert.ok(r1.indexOf('### Para onde eu quero') < r1.indexOf('### Quem assiste primeiro?'));
  assert.deepEqual(i1.perguntas, I.lerItem('x/item.md', COMPLETO).perguntas);
  // fora de Perguntas nada muda
  assert.equal(r1.replace(/## Perguntas[\s\S]*?## Variáveis/, ''), COMPLETO.replace(/## Perguntas[\s\S]*?## Variáveis/, ''));
  // trocar o texto troca só ele; voltar ao texto de antes volta ao arquivo de antes
  const r2 = aplicar(r1, I.remendoRumo('Outro rumo.'));
  assert.equal(I.lerItem('x/item.md', r2).rumo, 'Outro rumo.');
  assert.equal(aplicar(r2, I.remendoRumo('Quero levar para uma série.\n# do meu jeito')), r1);
  // item novo, vazio: rumo, pergunta dele e descartada ficam cada um no seu lugar
  const m = construir(arquivos());
  const novo = I.novoItem({ cadeia: cadeia(m, 'a'), hoje: '2026-10-28' }).text;
  let t = aplicar(novo, I.remendoNova(I.lerItem('x/item.md', novo), 'Quanto tempo tenho?', 'Duas semanas.'));
  t = aplicar(t, I.remendoRumo('Ser um vídeo só.'));
  t = aplicar(t, I.remendoExcluir(I.lerItem('x/item.md', t), 'Quanto tempo tenho?'));
  t = aplicar(t, I.remendoNova(I.lerItem('x/item.md', t), 'Para quem é', ''));
  const it = I.lerItem('x/item.md', t);
  assert.equal(it.rumo, 'Ser um vídeo só.');
  assert.deepEqual(it.perguntas.map(p => p.q), ['Para quem é']);
  assert.deepEqual(it.descartadas, ['Quanto tempo tenho?']);
  assert.match(lerSecao(abrir(t), ['Perguntas']), /^### Para onde eu quero\nSer um vídeo só\.\n\n### Para quem é\n\n### Descartadas\n- Quanto tempo tenho\?$/);
  assert.equal(fechar(abrir(t)), t);
});

test('excluir pergunta: vira descartada; Desfazer devolve o arquivo exato; excluir de vez fica', () => {
  const it = I.lerItem('x/item.md', COMPLETO);
  const p = it.perguntas[0];
  const ex = aplicar(COMPLETO, I.remendoExcluir(it, p.q));
  const i1 = I.lerItem('x/item.md', ex);
  assert.deepEqual(i1.perguntas.map(x => x.q), ['Precisa de convidado / parceiro?']);
  assert.deepEqual(i1.descartadas, ['Quem assiste primeiro?']);
  assert.ok(ex.indexOf('### Descartadas') > ex.indexOf('### Precisa') && ex.indexOf('### Descartadas') < ex.indexOf('## Variáveis'));
  assert.equal(I.estadoFerramenta(i1, 'perguntas'), 'pronto');
  // Desfazer: a pergunta volta no mesmo lugar, com a resposta, e as Descartadas somem (estavam vazias antes)
  assert.equal(aplicar(ex, I.remendoVolta(ex, p, 0)), COMPLETO);
  // Desfazer antes de gravar: os dois remendos juntos na fila dão o arquivo de antes
  assert.equal(aplicar(COMPLETO, juntar(I.remendoExcluir(it, p.q), I.remendoVolta(ex, p, 0))), COMPLETO);
  // excluir a segunda numa lista que já tinha descartadas: entra no fim da lista; desfazer volta ao lugar
  const ir = I.lerItem('x/item.md', COM_RUMO);
  const ex2 = aplicar(COM_RUMO, I.remendoExcluir(ir, ir.perguntas[1].q));
  assert.deepEqual(I.lerItem('x/item.md', ex2).descartadas, ['Qual é a cor favorita?', 'Vai ter música / trilha?', 'Precisa de convidado / parceiro?']);
  assert.equal(I.lerItem('x/item.md', ex2).rumo, ir.rumo);
  assert.equal(aplicar(ex2, I.remendoVolta(ex2, ir.perguntas[1], 1)), COM_RUMO);
  // excluir a última pergunta do arquivo (Perguntas no fim) não deixa sobra
  assert.equal(aplicar('## Perguntas\n\n### Uma?\nsim\n', { sec: { [secao('Perguntas', 'Uma?')]: null } }), '## Perguntas\n');
  // ordem da fila: resposta, excluir outra, mais resposta: vale a última resposta
  const fila = juntar(juntar(I.remendoResposta('Precisa de convidado / parceiro?', 'v1'), I.remendoExcluir(it, p.q)), I.remendoResposta('Precisa de convidado / parceiro?', 'v2'));
  const f = I.lerItem('x/item.md', aplicar(COMPLETO, fila));
  assert.deepEqual(f.perguntas.map(x => [x.q, x.r]), [['Precisa de convidado / parceiro?', 'v2']]);
  // trazer de volta depois (sem resposta), e a lista de descartadas some quando esvazia
  const tr = aplicar(ex, I.remendoTrazer(i1, 'Quem assiste primeiro?'));
  assert.deepEqual(I.lerItem('x/item.md', tr).perguntas.map(x => x.q), ['Precisa de convidado / parceiro?', 'Quem assiste primeiro?']);
  assert.ok(!tr.includes('### Descartadas'));
});

test('pergunta dele: com resposta, antes das descartadas; repetida ou reservada não entra', () => {
  const ir = I.lerItem('x/item.md', COM_RUMO);
  const t = aplicar(COM_RUMO, I.remendoNova(ir, '  Onde  gravar? ', 'No estúdio.'));
  const it = I.lerItem('x/item.md', t);
  assert.deepEqual(it.perguntas.map(p => [p.q, p.r]).at(-1), ['Onde gravar?', 'No estúdio.']);
  assert.ok(t.indexOf('### Onde gravar?') < t.indexOf('### Descartadas'));
  assert.deepEqual(it.descartadas, ir.descartadas);
  assert.equal(I.remendoNova(ir, 'quem assiste primeiro?', 'x'), null);
  assert.equal(I.remendoNova(ir, 'Descartadas', 'x'), null);
  assert.equal(I.remendoNova(ir, 'Para onde eu quero', 'x'), null);
  // uma descartada que ele mesmo escreve de novo sai das descartadas
  const t2 = aplicar(COM_RUMO, I.remendoNova(ir, 'Qual é a cor favorita?', 'Preto.'));
  assert.deepEqual(I.lerItem('x/item.md', t2).descartadas, ['Vai ter música / trilha?']);
});
