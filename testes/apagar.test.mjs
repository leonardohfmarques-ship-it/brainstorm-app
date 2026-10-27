// Apagar direção: GitHub de mentira (Git Data API) e modo local. Sem token real, exemplos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GitHubBackend, paraB64 } from '../js/github.js';
import { LocalBackend } from '../js/local.js';
import { Store } from '../js/sync.js';

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
      for (const e of b.tree) { if (e.sha !== null) return json(422, { message: 'só apagar' }); if (!nova.has(e.path)) return json(422, { message: 'path não existe' }); nova.delete(e.path); }
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
