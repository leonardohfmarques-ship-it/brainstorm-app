// Mapa que cresce no lugar: primeiro anel fixo, galhos sem sobreposição e migração do estado antigo.
// Árvore inventada (o repo do app é público: nada das ideias de verdade aqui).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desenharArvore, abertosPadrao, todosComGalhos, fecharRel, migrarUI, noPorRel, relDe, maeRel, ancestraisRel, largNome, ALTURA_NOME, visiveisRel } from '../js/arvore.js';

// monta { titulo, slug, direcoes } com kind/mae como o modelo do app
function no(titulo, filhos = []) { return { titulo, slug: titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-'), direcoes: filhos }; }
function ligar(raiz) {
  raiz.kind = 'ideia';
  const walk = n => n.direcoes.forEach(d => { d.kind = 'direcao'; d.mae = n; walk(d); });
  walk(raiz); return raiz;
}
const arvore = () => ligar(no('Ideia de exemplo', [
  no('Alfa'),
  no('Beta'),
  no('Gama', [
    no('Gama um'), no('Gama dois'), no('Gama tres'),
    no('Gama quatro', [no('Folha primeira longa'), no('Folha segunda'), no('Folha terceira bem comprida'), no('Folha quarta'), no('Folha quinta')]),
    no('Gama cinco')
  ]),
  no('Delta', [no('Delta um'), no('Delta dois')]),
  no('Epsilon')
]));

const primeiroAnel = lay => [...lay.pos].filter(([, p]) => p.nivel === 1).map(([r, p]) => [r, Math.round(p.x * 1000), Math.round(p.y * 1000)]);

test('primeiro anel não se mexe ao abrir e fechar galhos', () => {
  const r = arvore();
  const casos = [new Set(), new Set(abertosPadrao(r)), new Set(['gama', 'gama/gama-quatro']), new Set(todosComGalhos(r)), new Set(['delta'])];
  const base = primeiroAnel(desenharArvore(r, casos[0]));
  assert.equal(base.length, 5);
  for (const ab of casos) assert.deepEqual(primeiroAnel(desenharArvore(r, ab)), base);
});

test('só o que está aberto aparece; fechar fecha os de dentro', () => {
  const r = arvore();
  assert.deepEqual(abertosPadrao(r), ['gama', 'delta']);
  assert.deepEqual(todosComGalhos(r), ['gama', 'gama/gama-quatro', 'delta']);
  const lay = desenharArvore(r, new Set(['gama']));
  assert.ok(lay.pos.has('gama/gama-quatro'));
  assert.ok(!lay.pos.has('gama/gama-quatro/folha-quinta'));
  assert.ok(!lay.pos.has('delta/delta-um'));
  const s = fecharRel(new Set(todosComGalhos(r)), 'gama');
  assert.deepEqual([...s], ['delta']);
  assert.deepEqual(visiveisRel(r, new Set(['delta'])), ['alfa', 'beta', 'gama', 'delta', 'delta/delta-um', 'delta/delta-dois', 'epsilon']);
});

// caixa do nome de cada bolinha (lado de fora do círculo), como o app desenha
function caixa(p, titulo) {
  const w = largNome(titulo), h = ALTURA_NOME - 4;
  return Math.cos(p.a) >= 0 ? { x0: p.x - 8, x1: p.x + w, y0: p.y - h / 2, y1: p.y + h / 2 } : { x0: p.x - w, x1: p.x + 8, y0: p.y - h / 2, y1: p.y + h / 2 };
}
const cruza = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('galhos fundos não se sobrepõem (5 galhos no terceiro nível)', () => {
  const r = arvore();
  for (const ab of [new Set(['gama', 'gama/gama-quatro']), new Set(todosComGalhos(r))]) {
    const lay = desenharArvore(r, ab);
    const fundos = [...lay.pos].filter(([, p]) => p.nivel >= 2);
    const folhas = fundos.filter(([rel]) => rel.startsWith('gama/gama-quatro/'));
    assert.equal(folhas.length, 5);
    // filhos saem para fora: cada um mais longe do centro que a mãe
    for (const [rel, p] of fundos) {
      const m = lay.pos.get(maeRel(rel));
      assert.ok(Math.hypot(p.x, p.y) > Math.hypot(m.x, m.y) + 100, `${rel} fica fora da mãe`);
    }
    for (let i = 0; i < fundos.length; i++) for (let j = i + 1; j < fundos.length; j++) {
      const [ra, pa] = fundos[i], [rb, pb] = fundos[j];
      const ta = noPorRel(r, ra).titulo, tb = noPorRel(r, rb).titulo;
      assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= 25, `${ra} e ${rb} longe o bastante`);
      assert.ok(!cruza(caixa(pa, ta), caixa(pb, tb)), `nomes de ${ra} e ${rb} não se cruzam`);
    }
  }
});

test('muitos galhos num anel aumentam o raio em vez de sobrepor', () => {
  const muitos = ligar(no('Cheia', [no('Mae', Array.from({ length: 40 }, (_, i) => no('Galho numero ' + i)))]));
  const lay = desenharArvore(muitos, new Set(['mae']));
  const ps = [...lay.pos].filter(([, p]) => p.nivel === 2).map(([, p]) => p);
  assert.equal(ps.length, 40);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) >= 25);
});

test('endereços (rel) das direções', () => {
  const r = arvore();
  const f = noPorRel(r, 'gama/gama-quatro/folha-quarta');
  assert.equal(f.titulo, 'Folha quarta');
  assert.equal(relDe(f), 'gama/gama-quatro/folha-quarta');
  assert.equal(relDe(r), '');
  assert.equal(noPorRel(r, 'gama/nao-existe'), null);
  assert.equal(maeRel('gama/gama-quatro'), 'gama');
  assert.equal(maeRel('gama'), null);
  assert.deepEqual(ancestraisRel('a/b/c'), ['a', 'a/b']);
});

test('estado antigo (página por direção) vira ideia aberta com a direção selecionada e aberta', () => {
  const r = arvore();
  const achar = k => k === 'youtube/exemplo' ? r : null;
  const ui = { path: ['youtube/exemplo', 'gama', 'gama-quatro'], sel: 'folha-quarta' };
  const ab = {};
  assert.equal(migrarUI(ui, ab, achar), true);
  assert.deepEqual(ui.path, ['youtube/exemplo']);
  assert.equal(ui.sel, 'gama/gama-quatro');
  assert.deepEqual(ab['youtube/exemplo'].sort(), ['delta', 'gama', 'gama/gama-quatro']);
  // caminho que não existe mais: fica na parte que existe
  const ui2 = { path: ['youtube/exemplo', 'gama', 'sumiu'], sel: null };
  migrarUI(ui2, {}, achar);
  assert.equal(ui2.sel, 'gama');
  // ideia que sumiu: só tira o fundo
  const ui3 = { path: ['youtube/sumiu', 'x'], sel: 'y' };
  migrarUI(ui3, {}, achar);
  assert.deepEqual(ui3, { path: ['youtube/sumiu'], sel: null });
  // já no formato novo: nada muda
  const ui4 = { path: ['youtube/exemplo'], sel: 'gama/gama-um' };
  assert.equal(migrarUI(ui4, {}, achar), false);
  assert.equal(ui4.sel, 'gama/gama-um');
});
