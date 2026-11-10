// Apagar direção: GitHub de mentira (Git Data API) e modo local. Sem token real, exemplos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GitHubBackend, paraB64 } from '../js/github.js';
import { LocalBackend } from '../js/local.js';
import { Store } from '../js/sync.js';
import { fimDoNome, descreverClique, seletorDoClique } from '../js/arvore.js';
import { novaDirecao, aplicar as aplicarMd } from '../js/formato.js';
import { construir, lerLixeira, resumoParaLixeira, naLixeira } from '../js/modelo.js';

const TOKEN = 'github_pat_FALSO_456';
const sha = t => createHash('sha1').update(t).digest('hex');

// repositório falso com commits: árvore = Map path -> texto
function repoFalso(inicial) {
  let files = new Map(Object.entries(inicial));
  const arvores = new Map(), commits = new Map();
  const guardarArvore = m => { const s = 'tree-' + sha([...m].map(([p, t]) => p + '\0' + t).sort().join('|')); arvores.set(s, new Map(m)); return s; };
  let head = 'c0'; commits.set(head, { tree: guardarArvore(files), parents: [] });
  const log = []; let corrida = 0; // quantas vezes "alguém" grava entre o commit e a ref
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
  const fetch = async (url, opts = {}) => {
    const u = new URL(url); const metodo = opts.method || 'GET';
    log.push({ metodo, p: u.pathname, body: opts.body });
    assert.equal(opts.headers.Authorization, 'Bearer ' + TOKEN);
    const p = decodeURIComponent(u.pathname).replace('/repos/dono/brainstorm', '');
    if (p === '/git/ref/heads/main') return json(200, { object: { sha: head } });
    let m = p.match(/^\/git\/commits\/(\w+)$/);
    if (m) return commits.has(m[1]) ? json(200, { sha: m[1], tree: { sha: commits.get(m[1]).tree } }) : json(404, {});
    m = p.match(/^\/git\/trees\/([\w-]+)$/);
    if (m && metodo === 'GET') {
      const arv = m[1] === 'main' ? files : arvores.get(m[1]); if (!arv) return json(404, {});
      return json(200, { sha: m[1], truncated: false, tree: [...arv].map(([path, t]) => ({ path, type: 'blob', mode: '100644', sha: sha(t) })) });
    }
    if (p === '/git/trees' && metodo === 'POST') {
      const b = JSON.parse(opts.body); const base = arvores.get(b.base_tree); if (!base) return json(422, { message: 'base_tree inválida' });
      const nova = new Map(base);
      const porSha = h => { for (const arv of arvores.values()) for (const t of arv.values()) if (sha(t) === h) return t; return null; };
      for (const e of b.tree) {
        if (e.sha === null) { if (!nova.has(e.path)) return json(422, { message: 'path não existe' }); nova.delete(e.path); }
        else if (e.content != null) nova.set(e.path, e.content);
        else { const t = porSha(e.sha); if (t == null) return json(422, { message: 'blob não existe' }); nova.set(e.path, t); }
      }
      return json(201, { sha: guardarArvore(nova) });
    }
    if (p === '/git/commits' && metodo === 'POST') {
      const b = JSON.parse(opts.body); const s = 'c' + commits.size;
      commits.set(s, { tree: b.tree, parents: b.parents, message: b.message });
      if (corrida > 0) { corrida--; files.set('ideias/soltas/outra/ideia.md', 'mudou ' + corrida); head = 'x' + corrida; commits.set(head, { tree: guardarArvore(files), parents: [] }); }
      return json(201, { sha: s });
    }
    if (p === '/git/refs/heads/main' && metodo === 'PATCH') {
      const b = JSON.parse(opts.body); const c = commits.get(b.sha);
      if (b.force) return json(400, { message: 'nada de forçar' });
      if (c.parents[0] !== head) return json(422, { message: 'Update is not a fast forward' });
      head = b.sha; files = new Map(arvores.get(c.tree));
      return json(200, { object: { sha: head } });
    }
    m = p.match(/^\/git\/blobs\/(\w+)$/);
    if (m) { for (const t of files.values()) if (sha(t) === m[1]) return json(200, { content: paraB64(t), encoding: 'base64' }); return json(404, {}); }
    return json(404, { message: 'Not Found' });
  };
  return { get files() { return files; }, log, fetch, commits, correr: n => { corrida = n; } };
}

const IDEIA = '---\ntitulo: Exemplo\narea: youtube\nestado: ativa\n---\n\n## Bruto\n\n### Fala\n> Oi.\n\n### Anotações\n\n## Lapidado\n';
const DIR = t => `---\ntitulo: ${t}\nordem: 1\n---\n\n## Bruto\n\n### Anotações\n\n## Lapidado\nTexto.\n`;
const Q = 'ideias/youtube/quadro';
const inicial = {
  [`${Q}/ideia.md`]: IDEIA,
  [`${Q}/direcoes/ruim/direcao.md`]: DIR('Ruim'),
  [`${Q}/direcoes/ruim/anexos/foto.png`]: '\x89PNG',
  [`${Q}/direcoes/ruim/direcoes/dentro/direcao.md`]: DIR('Dentro'),
  [`${Q}/direcoes/ruim-mesmo/direcao.md`]: DIR('Ruim mesmo'),
  [`${Q}/direcoes/boa/direcao.md`]: DIR('Boa'),
  'ideias/soltas/outra/ideia.md': IDEIA
};
const novo = r => new GitHubBackend({ owner: 'dono', repo: 'brainstorm', branch: 'main', token: TOKEN, fetch: r.fetch });

test('GitHub: apaga a pasta inteira (direções dentro e anexos) num commit só, sem forçar', async () => {
  const r = repoFalso(inicial); const b = novo(r);
  const res = await b.apagar(`${Q}/direcoes/ruim`, 'App: apaga a direção "Ruim"');
  assert.equal(res.apagados, 3);
  assert.deepEqual([...r.files.keys()].sort(), ['ideias/soltas/outra/ideia.md', `${Q}/direcoes/boa/direcao.md`, `${Q}/direcoes/ruim-mesmo/direcao.md`, `${Q}/ideia.md`], 'irmã com nome parecido fica');
  const patch = r.log.filter(l => l.metodo === 'PATCH');
  assert.equal(patch.length, 1);
  assert.equal(JSON.parse(patch[0].body).force, false);
  assert.equal(r.log.filter(l => l.metodo === 'POST' && l.p.endsWith('/git/commits')).map(l => JSON.parse(l.body).message)[0], 'App: apaga a direção "Ruim"');
  assert.equal(r.log.filter(l => l.metodo === 'PUT' || l.metodo === 'DELETE').length, 0);
});

test('GitHub: se alguém gravou no meio, refaz por cima do novo (não perde o commit dos outros)', async () => {
  const r = repoFalso(inicial); const b = novo(r);
  r.correr(1);
  const res = await b.apagar(`${Q}/direcoes/ruim`, 'App: apaga');
  assert.equal(res.apagados, 3);
  assert.equal(r.files.get('ideias/soltas/outra/ideia.md'), 'mudou 0', 'mudança dos outros preservada');
  assert.ok(!r.files.has(`${Q}/direcoes/ruim/direcao.md`));
  assert.equal(r.log.filter(l => l.metodo === 'PATCH').length, 2);
});

test('GitHub: pasta que já não existe não faz commit', async () => {
  const r = repoFalso(inicial); const b = novo(r);
  assert.deepEqual(await b.apagar(`${Q}/direcoes/nao-tem`, 'App: apaga'), { apagados: 0 });
  assert.equal(r.log.filter(l => l.metodo !== 'GET').length, 0);
});

test('Store: ocultar some na hora, mostrar desfaz, apagarPasta manda e descarta o pendente de dentro', async () => {
  const r = repoFalso(inicial); const s = new Store(novo(r)); await s.carregar();
  const qtd = () => s.model.ideias.find(i => i.key === 'youtube/quadro').direcoes.length;
  assert.equal(qtd(), 3);
  assert.equal(s.model.ideias.find(i => i.key === 'youtube/quadro').direcoes.find(d => d.slug === 'ruim').anexos.length, 1);
  const base = `${Q}/direcoes/ruim`;
  s.ocultar(base); assert.equal(qtd(), 2);
  s.mostrar(base); assert.equal(qtd(), 3);
  // mudança pendente dentro da pasta não deve ir para o GitHub depois de apagar
  s.remendar(`${base}/direcao.md`, { sec: { 'Bruto/Anotações': 'nota' } }, 'App: anotações em "Ruim"');
  s.ocultar(base);
  s.apagarPasta(base, 'App: apaga a direção "Ruim" (e o que tinha dentro)');
  assert.equal(qtd(), 2);
  assert.equal(s.ocupado, true);
  await s.agora(); clearTimeout(s.timer);
  assert.equal(s.status, 'salvo');
  assert.ok(![...r.files.keys()].some(p => p.startsWith(base + '/')));
  assert.equal(r.log.filter(l => l.metodo === 'PUT').length, 0, 'anotação pendente descartada');
  assert.ok(!s.anexos.some(a => a.path.startsWith(base + '/')));
  // recarregar do GitHub continua sem a direção
  await s.carregar(); assert.equal(qtd(), 2);
});

/* ---------------- modo local ---------------- */
function navegadorFalso(arquivos) {
  const mem = new Map();
  globalThis.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  globalThis.fetch = async url => {
    const p = decodeURIComponent(String(url).replace(/^\.\/dados\//, ''));
    return arquivos[p] != null ? { ok: true, status: 200, text: async () => arquivos[p] } : { ok: false, status: 404, text: async () => '' };
  };
  return mem;
}

test('local: apagar some ao recarregar, não toca nos arquivos e "descartar" traz de volta', async () => {
  const arquivos = { ...inicial };
  const mem = navegadorFalso(arquivos);
  const listar = async function () { return Object.keys(arquivos); };
  const b = new LocalBackend({ atraso: 0 }); b.listar = listar;
  const s = new Store(b); await s.carregar();
  const base = `${Q}/direcoes/ruim`;
  s.criar(`${base}/direcoes/nova/direcao.md`, DIR('Nova'), 'App: cria');
  await s.agora(); clearTimeout(s.timer);
  s.apagarPasta(base, 'App: apaga a direção "Ruim"');
  await s.agora(); clearTimeout(s.timer);
  assert.ok(JSON.parse(mem.get('bs-local-apagados')).includes(base));
  assert.ok(!Object.keys(JSON.parse(mem.get('bs-local-overlay'))).some(p => p.startsWith(base + '/')), 'criada lá dentro também some');
  assert.equal(arquivos[`${base}/direcao.md`], DIR('Ruim'), 'arquivo de verdade intacto');
  const b2 = new LocalBackend({ atraso: 0 }); b2.listar = listar;
  const s2 = new Store(b2); await s2.carregar();
  const ideia = s2.model.ideias.find(i => i.key === 'youtube/quadro');
  assert.deepEqual(ideia.direcoes.map(d => d.slug), ['boa', 'ruim-mesmo']);
  assert.equal(await b2.ler(`${base}/direcao.md`), null);
  b2.descartar();
  const b3 = new LocalBackend({ atraso: 0 }); b3.listar = listar;
  const s3 = new Store(b3); await s3.carregar();
  assert.equal(s3.model.ideias.find(i => i.key === 'youtube/quadro').direcoes.length, 3);
});

/* ---------------- direção nova com o nome aberto (09/11: "o botão de apagar direção não funciona") ---------------- */
test('nome aberto: Apagar e Esc numa direção provisória descartam; Enter e clique fora criam', () => {
  const prov = { provisorio: true, antigo: 'Direção nova' };
  assert.equal(fimDoNome({ ...prov, motivo: 'apagar', valor: 'Direção nova' }).acao, 'descartar', 'clicar em Apagar não cria a direção');
  assert.equal(fimDoNome({ ...prov, motivo: 'apagar', valor: 'Algo digitado' }).acao, 'descartar', 'nem com nome digitado');
  assert.equal(fimDoNome({ ...prov, motivo: 'esc', valor: 'Direção nova' }).acao, 'descartar', 'Esc não vira "Direção nova"');
  assert.deepEqual(fimDoNome({ ...prov, motivo: 'enter', valor: '  Com   espaços ' }), { acao: 'criar', nome: 'Com espaços' });
  assert.deepEqual(fimDoNome({ ...prov, motivo: 'blur', valor: '   ' }), { acao: 'criar', nome: 'Direção nova' });
  // direção antiga: Esc não muda nada; Enter só grava se o nome mudou; Apagar com o nome aberto não cria nada novo
  const velha = { provisorio: false, antigo: 'Antiga' };
  assert.equal(fimDoNome({ ...velha, motivo: 'esc', valor: 'Outra' }).acao, 'nada');
  assert.equal(fimDoNome({ ...velha, motivo: 'enter', valor: 'Antiga' }).acao, 'nada');
  assert.deepEqual(fimDoNome({ ...velha, motivo: 'blur', valor: 'Outra' }), { acao: 'renomear', nome: 'Outra' });
  assert.notEqual(fimDoNome({ ...velha, motivo: 'apagar', valor: 'Antiga' }).acao, 'criar');
});

test('Store: descartar a direção provisória não manda nada ao GitHub', async () => {
  const r = repoFalso(inicial); const s = new Store(novo(r)); await s.carregar();
  const path = `${Q}/direcoes/direcao-nova/direcao.md`;
  s.files.set(path, { text: novaDirecao('Direção nova', 4), remoto: null, sha: null }); s.reconstruir();
  const qtd = () => s.model.ideias.find(i => i.key === 'youtube/quadro').direcoes.length;
  assert.equal(qtd(), 4);
  s.descartar(path);
  assert.equal(qtd(), 3);
  assert.equal(s.ocupado, false, 'nada na fila');
  await s.agora(); clearTimeout(s.timer);
  assert.equal(r.log.filter(l => l.metodo !== 'GET').length, 0, 'nenhum commit');
  assert.ok(!r.files.has(path));
});

function memoriaFalsa() { const m = new Map(); return { m, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }

test('apagar e recarregar antes do envio: o próximo carregamento termina o serviço (não "some e volta")', async () => {
  const r = repoFalso(inicial); const mem = memoriaFalsa();
  const base = `${Q}/direcoes/ruim`;
  const s1 = new Store(novo(r), { memoria: mem }); await s1.carregar();
  s1.ocultar(base); s1.apagarPasta(base, 'App: apaga a direção "Ruim"');
  clearTimeout(s1.timer); // a página fechou antes dos 800 ms: nada foi enviado
  assert.ok(r.files.has(`${base}/direcao.md`));
  assert.equal(JSON.parse(mem.getItem('bs-apagar-pendente'))[0].base, base, 'ficou anotado no navegador');
  const s2 = new Store(novo(r), { memoria: mem }); await s2.carregar();
  assert.deepEqual(s2.retomarApagar(), [base]);
  assert.equal(s2.model.ideias.find(i => i.key === 'youtube/quadro').direcoes.length, 2, 'já some da tela ao abrir');
  await s2.agora(); clearTimeout(s2.timer);
  assert.ok(![...r.files.keys()].some(p => p.startsWith(base + '/')), 'apagado no GitHub');
  assert.equal(mem.getItem('bs-apagar-pendente'), null, 'anotação limpa depois do envio');
  // de novo: nada a retomar, nenhum commit a mais
  const commits = r.log.filter(l => l.metodo === 'PATCH').length;
  const s3 = new Store(novo(r), { memoria: mem }); await s3.carregar();
  assert.deepEqual(s3.retomarApagar(), []);
  await s3.agora(); clearTimeout(s3.timer);
  assert.equal(r.log.filter(l => l.metodo === 'PATCH').length, commits);
});

test('apagar anotado de uma pasta que já não existe sai da lista sem commit', async () => {
  const r = repoFalso(inicial); const mem = memoriaFalsa();
  mem.setItem('bs-apagar-pendente', JSON.stringify([{ base: `${Q}/direcoes/nao-tem`, msg: 'App: apaga' }]));
  const s = new Store(novo(r), { memoria: mem }); await s.carregar();
  assert.deepEqual(s.retomarApagar(), []);
  assert.equal(mem.getItem('bs-apagar-pendente'), null);
  assert.equal(s.ocupado, false);
});

/* ---------------- outros cliques com o nome de uma direção nova aberto (09/11) ----------------
   O nome fecha como "clique fora" (cria a direção) e o clique vai para o mesmo botão na tela redesenhada. */
const elFalso = (tag, classes, attrs) => ({ tagName: tag.toUpperCase(), classList: classes, hasAttribute: a => a in attrs, getAttribute: a => attrs[a] ?? null });
const DE = 'direcao-nova-2', PARA = 'meu-nome';
const sel = el => seletorDoClique(descreverClique(el), DE, PARA);

test('clique com nome aberto: Desenvolver, Decidir, Renomear e Guardar acham o mesmo botão no painel novo', () => {
  assert.equal(sel(elFalso('button', ['btn', 'btn--solid'], { 'data-act': 'desenvolver' })), 'button.btn[data-act="desenvolver"]');
  assert.equal(sel(elFalso('button', ['btn', 'btn--sm', 'btn--solid'], { 'data-act': 'decidir' })), 'button.btn[data-act="decidir"]');
  assert.equal(sel(elFalso('button', ['btn', 'btn--sm'], { 'data-act': 'renomear' })), 'button.btn[data-act="renomear"]');
  assert.equal(sel(elFalso('button', ['btn', 'btn--sm'], { 'data-act': 'guardar' })), 'button.btn[data-act="guardar"]');
});

test('clique com nome aberto: aba de outra direção fica igual; a aba e a estação da própria nova passam para o nome criado', () => {
  assert.equal(sel(elFalso('button', ['tab'], { id: 'tab-serie', 'data-id': 'serie' })), 'button.tab[data-id="serie"]');
  assert.equal(sel(elFalso('button', ['tab'], { id: 'tab-c', 'data-id': '' })), 'button.tab[data-id=""]', 'aba Resumo');
  assert.equal(sel(elFalso('button', ['tab'], { id: 'tab-' + DE, 'data-id': DE })), `button.tab[data-id="${PARA}"]`);
  assert.equal(sel(elFalso('button', ['st', 'st--dir', 'is-sel'], { 'data-id': 'd:' + DE })), `button.st[data-id="d:${PARA}"]`);
  assert.equal(sel(elFalso('button', ['st', 'st--dir'], { 'data-id': 'd:base' })), 'button.st[data-id="d:base"]', 'outra estação');
  assert.equal(sel(elFalso('button', ['drow'], { 'data-kid': DE })), `button.drow[data-kid="${PARA}"]`);
});

test('clique com nome aberto: botões por id, campos e o que não tem como achar', () => {
  assert.equal(sel(elFalso('button', ['btn'], { id: 'btnNova' })), '[id="btnNova"]');
  assert.equal(sel(elFalso('textarea', ['notas'], { id: 'notas' })), '[id="notas"]');
  assert.equal(sel(elFalso('button', ['crumb'], { 'data-k': '0' })), 'button.crumb[data-k="0"]');
  assert.equal(sel(elFalso('div', [], {})), null, 'fundo do mapa: só fecha o nome');
  assert.equal(seletorDoClique(null, DE, PARA), null);
  assert.equal(seletorDoClique(descreverClique(elFalso('button', ['x'], { 'data-id': 'a"b' })), DE, PARA), 'button.x[data-id="a\\"b"]', 'aspas escapadas');
  // sem nome novo (falhou ao criar), nada é trocado
  assert.equal(seletorDoClique(descreverClique(elFalso('button', ['tab'], { 'data-id': DE })), DE, DE), `button.tab[data-id="${DE}"]`);
});

/* ---------------- lixeira de ideias (decisão de 09/11/2026: apagar a ideia inteira, com confirmação e lixeira) ---------------- */
const ITEM = e => `---\ntitulo: Ponta\norigem: direcoes/boa\nestado: ${e}\ncriado: 2026-11-01\n---\n\n## Contexto\nx\n\n## Plano\n\n### A fazer\n- [ ] Uma\n\n### Fazendo\n\n### Feito\n- [x] Duas\n`;
const comEtapas = { ...inicial,
  [`${Q}/decididas/na-edicao/item.md`]: ITEM('edicao'),
  [`${Q}/decididas/no-kanban/item.md`]: ITEM('kanban'),
  [`${Q}/decididas/concluido/item.md`]: ITEM('feita') };
const L = naLixeira(Q);
const marcar = t => aplicarMd(t, { fm: { apagada: '2026-11-09' } });

test('lixeira: o que vai junto conta direções, itens de cada etapa, tarefas feitas e anexos', () => {
  const m = construir(new Map(Object.entries(comEtapas).filter(([p]) => !p.includes('/anexos/')).map(([p, t]) => [p, { text: t }])), [{ path: `${Q}/direcoes/ruim/anexos/foto.png` }]);
  const r = resumoParaLixeira(m.ideias.find(i => i.key === 'youtube/quadro'));
  assert.deepEqual([r.direcoes, r.edicao, r.kanban, r.concluidos, r.feitas, r.anexos], [4, 1, 1, 1, 3, 1]);
  assert.deepEqual(r.partes, ['4 direções', '1 item na Edição', '1 item no Kanban', '1 item concluído', '3 tarefas feitas', '1 anexo']);
});

test('lixeira: GitHub move a ideia inteira (direções, itens da Edição e do Kanban, anexos) num commit só, sem forçar', async () => {
  const r = repoFalso(comEtapas); const b = novo(r);
  const res = await b.mover(Q, L, 'App: manda a ideia "Exemplo" para a lixeira', { 'ideia.md': marcar(IDEIA) });
  assert.equal(res.movidos, 9);
  assert.ok(![...r.files.keys()].some(p => p.startsWith(Q + '/')), 'nada sobra em ideias/');
  assert.equal(r.files.get(`${L}/decididas/no-kanban/item.md`), ITEM('kanban'), 'item do Kanban vai junto, intacto');
  assert.equal(r.files.get(`${L}/decididas/na-edicao/item.md`), ITEM('edicao'));
  assert.equal(r.files.get(`${L}/direcoes/ruim/anexos/foto.png`), '\x89PNG', 'anexo vai com o mesmo conteúdo');
  assert.match(r.files.get(`${L}/ideia.md`), /^apagada: 2026-11-09$/m);
  assert.equal(r.files.get('ideias/soltas/outra/ideia.md'), IDEIA, 'outra ideia não muda');
  const patch = r.log.filter(l => l.metodo === 'PATCH');
  assert.equal(patch.length, 1); assert.equal(JSON.parse(patch[0].body).force, false);
  // destino ocupado: recusa em vez de misturar
  const r2 = repoFalso({ [`${Q}/ideia.md`]: IDEIA, [`${L}/ideia.md`]: IDEIA });
  await assert.rejects(novo(r2).mover(Q, L, 'App: x'), /Já existe/);
  // pasta que não existe: nada de commit
  const r3 = repoFalso(inicial);
  assert.deepEqual(await novo(r3).mover('ideias/youtube/nao-tem', 'lixeira/ideias/youtube/nao-tem', 'App: x'), { movidos: 0 });
  assert.equal(r3.log.filter(l => l.metodo !== 'GET').length, 0);
});

test('lixeira: Store manda para a lixeira (some do mapa e das etapas na hora), restaura e apaga de vez', async () => {
  const r = repoFalso(comEtapas); const s = new Store(novo(r)); await s.carregar();
  const ideia = () => s.model.ideias.find(i => i.key === 'youtube/quadro');
  // mudança ainda não enviada dentro da ideia vai junto para a lixeira (sem PUT avulso)
  s.remendar(`${Q}/direcoes/boa/direcao.md`, { sec: { 'Bruto/Anotações': 'nota nova' } }, 'App: anotações');
  s.moverPasta(Q, L, 'App: manda a ideia "Exemplo" para a lixeira', { 'ideia.md': marcar(s.texto(`${Q}/ideia.md`)) });
  assert.equal(ideia(), undefined, 'sumiu do mapa');
  assert.equal(s.model.itens.filter(i => i.key.startsWith('youtube/quadro/')).length, 0, 'sumiu da Edição e do Kanban');
  assert.deepEqual(s.lixeira.map(x => [x.base, x.orig, x.titulo, x.apagada]), [[L, Q, 'Exemplo', '2026-11-09']]);
  await s.agora(); clearTimeout(s.timer);
  assert.equal(r.log.filter(l => l.metodo === 'PUT').length, 0);
  assert.match(r.files.get(`${L}/direcoes/boa/direcao.md`), /nota nova/);
  assert.ok(![...r.files.keys()].some(p => p.startsWith(Q + '/')));
  // recarregar: continua na lixeira, fora do mapa
  await s.carregar();
  assert.equal(ideia(), undefined); assert.equal(s.lixeira.length, 1);
  assert.ok(![...s.files.keys()].some(p => p.startsWith(L + '/') && !p.endsWith(L + '/ideia.md')), 'da lixeira só o ideia.md é lido');
  // restaurar: volta inteira para o lugar, sem a marca
  s.moverPasta(L, Q, 'App: restaura a ideia "Exemplo" da lixeira', { 'ideia.md': aplicarMd(s.texto(`${L}/ideia.md`), { fm: { apagada: null } }) });
  assert.ok(ideia()); assert.equal(s.lixeira.length, 0);
  await s.agora(); clearTimeout(s.timer);
  assert.equal(r.files.get(`${Q}/ideia.md`), IDEIA, 'ideia.md igual ao de antes');
  assert.equal(r.files.get(`${Q}/decididas/no-kanban/item.md`), ITEM('kanban'));
  await s.carregar();
  assert.equal(ideia().itens.length, 3, 'itens de volta nas etapas');
  // apagar de vez: só pela lixeira
  s.moverPasta(Q, L, 'App: lixeira', { 'ideia.md': marcar(s.texto(`${Q}/ideia.md`)) });
  await s.agora(); clearTimeout(s.timer);
  s.apagarPasta(L, 'App: apaga de vez a ideia "Exemplo" (estava na lixeira)');
  assert.equal(s.lixeira.length, 0);
  await s.agora(); clearTimeout(s.timer);
  assert.ok(![...r.files.keys()].some(p => p.startsWith(L + '/') || p.startsWith(Q + '/')), 'nada sobra no repositório');
  assert.equal(r.files.get('ideias/soltas/outra/ideia.md'), IDEIA);
});

test('lixeira: recarregar antes do envio termina de mandar para a lixeira (com a marca da data)', async () => {
  const r = repoFalso(comEtapas); const mem = memoriaFalsa();
  const s1 = new Store(novo(r), { memoria: mem }); await s1.carregar();
  s1.moverPasta(Q, L, 'App: lixeira', { 'ideia.md': marcar(IDEIA) });
  clearTimeout(s1.timer);
  assert.ok(r.files.has(`${Q}/ideia.md`), 'ainda não foi');
  const s2 = new Store(novo(r), { memoria: mem }); await s2.carregar();
  assert.deepEqual(s2.retomarApagar(), [Q]);
  await s2.agora(); clearTimeout(s2.timer);
  assert.match(r.files.get(`${L}/ideia.md`), /apagada: 2026-11-09/);
  assert.ok(!r.files.has(`${Q}/ideia.md`));
  assert.equal(mem.getItem('bs-apagar-pendente'), null);
});

test('lixeira é ignorada pelo mapa: nenhuma ideia, direção, item ou erro vem de lixeira/', () => {
  const files = new Map([
    ['ideias/soltas/outra/ideia.md', { text: IDEIA }],
    [`${L}/ideia.md`, { text: marcar(IDEIA) }],
    [`${L}/direcoes/boa/direcao.md`, { text: DIR('Boa') }],
    [`${L}/decididas/no-kanban/item.md`, { text: ITEM('kanban') }]
  ]);
  const m = construir(files, [{ path: `${L}/anexos/a.png` }]);
  assert.deepEqual(m.ideias.map(i => i.key), ['soltas/outra']);
  assert.equal(m.itens.length, 0); assert.deepEqual(m.erros, []);
  assert.equal(lerLixeira(files).length, 1);
});

test('lixeira no modo local: manda, recarrega, restaura e apaga de vez, sem tocar nos arquivos', async () => {
  const arquivos = { ...comEtapas };
  const mem = navegadorFalso(arquivos);
  const listar = async function (dir) { return Object.keys(arquivos).filter(p => p.startsWith(dir)); };
  const existe = async dir => Object.keys(arquivos).some(p => p.startsWith(dir.replace(/\/+$/, '') + '/'));
  const abrir = async () => { const b = new LocalBackend({ atraso: 0 }); b.listar = listar; b.existe = existe; const s = new Store(b); await s.carregar(); return s; };
  let s = await abrir();
  s.moverPasta(Q, L, 'App: lixeira', { 'ideia.md': marcar(s.texto(`${Q}/ideia.md`)) });
  await s.agora(); clearTimeout(s.timer);
  s = await abrir();
  assert.equal(s.model.ideias.find(i => i.key === 'youtube/quadro'), undefined);
  assert.equal(s.lixeira.length, 1);
  assert.equal(arquivos[`${Q}/ideia.md`], IDEIA, 'arquivo de verdade intacto');
  assert.equal(JSON.parse(mem.get('bs-local-overlay'))[`${L}/decididas/no-kanban/item.md`], ITEM('kanban'), 'item do Kanban foi junto para a lixeira');
  s.moverPasta(L, Q, 'App: restaura', { 'ideia.md': aplicarMd(s.texto(`${L}/ideia.md`), { fm: { apagada: null } }) });
  await s.agora(); clearTimeout(s.timer);
  s = await abrir();
  assert.ok(s.model.ideias.find(i => i.key === 'youtube/quadro'));
  assert.equal(s.model.ideias.find(i => i.key === 'youtube/quadro').itens.length, 3);
  assert.equal(s.lixeira.length, 0);
  s.moverPasta(Q, L, 'App: lixeira', { 'ideia.md': marcar(s.texto(`${Q}/ideia.md`)) });
  await s.agora(); clearTimeout(s.timer);
  s.apagarPasta(L, 'App: apaga de vez');
  await s.agora(); clearTimeout(s.timer);
  s = await abrir();
  assert.equal(s.lixeira.length, 0);
  assert.equal(s.model.ideias.find(i => i.key === 'youtube/quadro'), undefined);
  assert.ok(mem);
});
