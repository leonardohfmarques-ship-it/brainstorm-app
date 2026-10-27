// Etapas Brainstorm → Edição → Kanban: seções novas, estados e plano de ação. Exemplos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrir, fechar, aplicar, lerSecao } from '../js/formato.js';
import { construir, lerEstado } from '../js/modelo.js';
import * as P from '../js/plano.js';

const BASE = `---
titulo: Exemplo: uma ideia
area: instagram
estado: edicao
criada: 2026-10-27
---

## Bruto

### Fala
> Fala de exemplo.

### Anotações

## Lapidado

### Resumo
Resumo de exemplo.
`;
const COMPLETA = BASE + `
## Edição

### Escolhas
- Direções: Primeira; Segunda
- Formato: Reel de 30 s
- Canal: Instagram
- Prazo: 15/11/2026
- Ritmo: 1 por semana

### Versão final
Texto final de exemplo.

#### Gancho
Uma linha.

## Plano

### A fazer
- Escrever o roteiro
  com uma linha de continuação
- Gravar o teste

### Fazendo
- Separar as fotos

### Feito
`;

test('ideia com Edição e Plano: ida e volta exata', () => {
  assert.equal(fechar(abrir(COMPLETA)), COMPLETA);
  assert.equal(aplicar(COMPLETA, { fm: {}, sec: {} }), COMPLETA);
  const d = abrir(COMPLETA);
  assert.equal(lerSecao(d, ['Lapidado']), '### Resumo\nResumo de exemplo.');
  assert.equal(lerSecao(d, ['Edição', 'Versão final']), 'Texto final de exemplo.\n\n#### Gancho\nUma linha.');
  assert.equal(lerSecao(d, ['Plano', 'Feito']), '');
  // arquivo sem as seções novas continua igual
  assert.equal(aplicar(BASE, {}), BASE);
});

test('modelo lê escolhas, versão final e tarefas na ordem', () => {
  const m = construir(new Map([['ideias/instagram/exemplo/ideia.md', { text: COMPLETA }]]));
  const i = m.ideias[0];
  assert.equal(i.estado, 'edicao');
  assert.ok(i.edicao.existe);
  assert.ok(i.edicao.escolhas.startsWith('- Direções: Primeira; Segunda'));
  assert.deepEqual(i.plano.afazer.tarefas.map(t => t.texto), ['Escrever o roteiro', 'Gravar o teste']);
  assert.deepEqual(i.plano.fazendo.tarefas.map(t => t.texto), ['Separar as fotos']);
  assert.equal(i.plano.feito.tarefas.length, 0);
  assert.ok(i.temPlano);
  const sem = construir(new Map([['ideias/instagram/exemplo/ideia.md', { text: BASE }]])).ideias[0];
  assert.equal(sem.edicao.existe, false); assert.equal(sem.temPlano, false); assert.equal(P.total(sem.plano), 0);
});

test('estados: ativa, guardada, edicao, kanban, feita; o resto vira ativa', () => {
  assert.equal(lerEstado('edição'), 'edicao');
  assert.equal(lerEstado('Kanban'), 'kanban');
  assert.equal(lerEstado('feita'), 'feita');
  assert.equal(lerEstado('guardada'), 'guardada');
  assert.equal(lerEstado(''), 'ativa');
  assert.equal(lerEstado('qualquer'), 'ativa');
  // mudar o estado mexe só na linha do estado
  const t = aplicar(BASE, { fm: { estado: 'kanban' } });
  assert.equal(t, BASE.replace('estado: edicao', 'estado: kanban'));
  assert.equal(aplicar(t, { fm: { estado: 'edicao' } }), BASE);
});

test('Escolhas criada no lugar certo: depois do Lapidado e antes do Plano', () => {
  const t = aplicar(BASE, { sec: { 'Edição/Escolhas': '- Formato: Reel' } });
  assert.ok(t.endsWith('Resumo de exemplo.\n\n## Edição\n\n### Escolhas\n- Formato: Reel\n'), t);
  const comPlano = BASE + '\n## Plano\n\n### A fazer\n- Uma tarefa\n';
  const t2 = aplicar(comPlano, { sec: { 'Edição/Versão final': 'Final.' } });
  assert.ok(t2.indexOf('## Edição') > t2.indexOf('## Lapidado') && t2.indexOf('## Edição') < t2.indexOf('## Plano'), t2);
  assert.ok(t2.includes('### Versão final\nFinal.\n\n## Plano'), t2);
});

test('tarefas: ler e escrever de volta igual (cabeça e continuação preservadas)', () => {
  const md = 'Nota antes.\n\n- [ ] Um\n  detalhe do um\n- Dois';
  const c = P.lerTarefas(md);
  assert.deepEqual(c.cabeca, ['Nota antes.', '']);
  assert.deepEqual(c.tarefas.map(t => t.texto), ['Um', 'Dois']);
  assert.equal(P.escreverTarefas(c), 'Nota antes.\n\n- Um\n  detalhe do um\n- Dois');
  assert.equal(P.escreverTarefas(P.lerTarefas('')), '');
});

test('plano: mover muda a ordem e a coluna, e grava as três colunas', () => {
  const i = construir(new Map([['ideias/instagram/exemplo/ideia.md', { text: COMPLETA }]])).ideias[0];
  // reordenar dentro da coluna
  let p = P.mover(i.plano, { col: 'afazer', i: 1 }, { col: 'afazer', i: 0 });
  assert.deepEqual(p.afazer.tarefas.map(t => t.texto), ['Gravar o teste', 'Escrever o roteiro']);
  assert.deepEqual(i.plano.afazer.tarefas.map(t => t.texto), ['Escrever o roteiro', 'Gravar o teste'], 'original intacto');
  // mudar de coluna
  p = P.mover(p, { col: 'afazer', i: 1 }, { col: 'feito', i: 0 });
  assert.deepEqual(p.feito.tarefas.map(t => t.texto), ['Escrever o roteiro']);
  p = P.criar(p, 'fazendo', 'Nova\ntarefa', 0);
  p = P.editar(p, 'afazer', 0, 'Gravar o teste de luz');
  p = P.apagar(p, 'fazendo', 1);
  const t = aplicar(COMPLETA, P.remendo(p));
  assert.ok(t.includes('### A fazer\n- Gravar o teste de luz\n\n### Fazendo\n- Nova tarefa\n\n### Feito\n- Escrever o roteiro\n  com uma linha de continuação\n'), t);
  assert.ok(t.startsWith(BASE), 'nada fora do Plano mudou');
  const de = construir(new Map([['ideias/instagram/exemplo/ideia.md', { text: t }]])).ideias[0];
  assert.deepEqual(de.plano.feito.tarefas.map(x => x.texto), ['Escrever o roteiro']);
  // gravar o mesmo plano de novo não muda nada
  assert.equal(aplicar(t, P.remendo(de.plano)), t);
});

test('plano criado do zero numa ideia sem Plano', () => {
  const p = P.criar(P.vazio(), 'afazer', 'Primeira');
  const t = aplicar(BASE, P.remendo(p));
  assert.ok(t.endsWith('Resumo de exemplo.\n\n## Plano\n\n### A fazer\n- Primeira\n\n### Fazendo\n\n### Feito\n'), JSON.stringify(t));
});
