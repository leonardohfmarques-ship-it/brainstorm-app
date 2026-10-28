// GitHubBackend + Store contra um GitHub de mentira (fetch simulado). Sem token real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GitHubBackend, paraB64, deB64 } from '../js/github.js';
import { Store } from '../js/sync.js';

const TOKEN = 'github_pat_FALSO_123';
const sha = t => createHash('sha1').update(t).digest('hex');

function repoFalso(inicial) {
  const files = new Map(Object.entries(inicial));
  const log = [];
  let conflitoUmaVez = null; // path que vai mudar "no GitHub" antes do próximo PUT
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
  const fetch = async (url, opts = {}) => {
    const u = new URL(url);
    log.push({ url, method: opts.method || 'GET', auth: opts.headers && opts.headers.Authorization, body: opts.body });
    assert.equal(u.origin, 'https://api.github.com', 'só fala com api.github.com');
    assert.ok(!url.includes(TOKEN), 'token nunca na URL');
    if (opts.headers.Authorization !== 'Bearer ' + TOKEN) return json(401, { message: 'Bad credentials' });
    const p = decodeURIComponent(u.pathname);
    if (p === '/repos/dono/brainstorm') return json(200, { full_name: 'dono/brainstorm' });
    if (p === '/repos/dono/brainstorm/git/trees/main') {
      return json(200, { sha: sha([...files.values()].join('|')), truncated: false,
        tree: [...files.entries()].map(([path, t]) => ({ path, type: 'blob', sha: sha(t), size: t.length })).concat([{ path: 'ideias/youtube', type: 'tree', sha: 'x' }]) });
    }
    let m = p.match(/^\/repos\/dono\/brainstorm\/git\/blobs\/(\w+)$/);
    if (m) { for (const t of files.values()) if (sha(t) === m[1]) return json(200, { content: paraB64(t).replace(/(.{60})/g, '$1\n'), encoding: 'base64' }); return json(404, {}); }
    m = p.match(/^\/repos\/dono\/brainstorm\/contents\/(.+)$/);
    if (m) {
      const path = m[1];
      if ((opts.method || 'GET') === 'GET') { if (!files.has(path)) return json(404, { message: 'Not Found' }); const t = files.get(path); return json(200, { sha: sha(t), content: paraB64(t) }); }
      const body = JSON.parse(opts.body);
      if (conflitoUmaVez === path) { files.set(path, files.get(path).replace('## Lapidado', '## Lapidado\nLinha nova do Claude.')); conflitoUmaVez = null; }
      if (files.has(path)) {
        if (!body.sha) return json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
        if (body.sha !== sha(files.get(path))) return json(409, { message: `${path} does not match ${body.sha}` });
      }
      const t = deB64(body.content); files.set(path, t);
      return json(200, { content: { path, sha: sha(t) }, commit: { message: body.message } });
    }
    return json(404, { message: 'Not Found' });
  };
  return { files, log, fetch, conflito: p => { conflitoUmaVez = p; } };
}

const IDEIA = '---\ntitulo: Série: um título de exemplo\narea: youtube\nestado: ativa\n---\n\n## Bruto\n\n### Fala\n> Uma ideia.\n\n### Anotações\n\n## Lapidado\n\n### Resumo\nResumo.\n';
const DIR = '---\ntitulo: Reforma de verdade\nordem: 3\n---\n\n## Bruto\n\n### Anotações\n\n## Lapidado\nTexto.\n';
const inicial = {
  'ideias/youtube/quadro/ideia.md': IDEIA,
  'ideias/youtube/quadro/direcoes/reforma/direcao.md': DIR,
  'ideias/youtube/quadro/anexos/foto.png': '\x89PNG',
  'README.md': 'fora de ideias/'
};
const novo = r => new GitHubBackend({ owner: 'dono', repo: 'brainstorm', branch: 'main', token: TOKEN, fetch: r.fetch });

test('testar e carregar: árvore recursiva, blobs, anexos', async () => {
  const r = repoFalso(inicial); const b = novo(r);
  assert.equal(await b.testar(), true);
  const d = await b.load();
  assert.deepEqual([...d.files.keys()].sort(), ['ideias/youtube/quadro/direcoes/reforma/direcao.md', 'ideias/youtube/quadro/ideia.md']);
  assert.equal(d.files.get('ideias/youtube/quadro/ideia.md').text, IDEIA);
  assert.deepEqual(d.anexos.map(a => a.path), ['ideias/youtube/quadro/anexos/foto.png']);
  assert.ok(r.log.every(l => l.auth === 'Bearer ' + TOKEN));
});

test('chave errada vira erro de entrada', async () => {
  const r = repoFalso(inicial);
  const b = new GitHubBackend({ owner: 'dono', repo: 'brainstorm', token: 'outra', fetch: r.fetch });
  await assert.rejects(b.testar(), e => e.tipo === 'auth');
});

test('Store: renomear grava só o título, com mensagem em português e sha', async () => {
  const r = repoFalso(inicial); const s = new Store(novo(r)); await s.carregar();
  const f = 'ideias/youtube/quadro/direcoes/reforma/direcao.md';
  s.remendar(f, { fm: { titulo: 'Reforma: ao vivo' } }, 'App: renomeia direção "Reforma de verdade" para "Reforma: ao vivo"');
  assert.equal(s.status, 'salvando');
  await s.agora();
  assert.equal(s.status, 'salvo');
  assert.equal(r.files.get(f), DIR.replace('titulo: Reforma de verdade', 'titulo: Reforma: ao vivo'));
  const put = r.log.filter(l => l.method === 'PUT');
  assert.equal(put.length, 1);
  const body = JSON.parse(put[0].body);
  assert.equal(body.message, 'App: renomeia direção "Reforma de verdade" para "Reforma: ao vivo"');
  assert.equal(body.sha, sha(DIR)); assert.equal(body.branch, 'main');
  clearTimeout(s.timer);
});

test('Store: várias mudanças no mesmo arquivo viram um envio só', async () => {
  const r = repoFalso(inicial); const s = new Store(novo(r)); await s.carregar();
  const f = 'ideias/youtube/quadro/ideia.md';
  s.remendar(f, { sec: { 'Bruto/Anotações': 'o' } }, 'App: anotações em "Quadro"');
  s.remendar(f, { sec: { 'Bruto/Anotações': 'oi' } }, 'App: anotações em "Quadro"');
  s.remendar(f, { fm: { pos: [120, -40] } }, 'App: move a ideia "Quadro" no mapa geral');
  await s.agora(); clearTimeout(s.timer);
  assert.equal(r.log.filter(l => l.method === 'PUT').length, 1);
  assert.ok(r.files.get(f).includes('### Anotações\noi\n\n## Lapidado'));
  assert.ok(r.files.get(f).includes('pos: [120, -40]\n---'));
});

test('Store: conflito (409) rebusca, reaplica só o campo e não perde a mudança do Claude', async () => {
  const r = repoFalso(inicial); const s = new Store(novo(r)); await s.carregar();
  const f = 'ideias/youtube/quadro/direcoes/reforma/direcao.md';
  r.conflito(f);
  s.remendar(f, { fm: { pedido: 'desenvolver' } }, 'App: pede ao Claude para desenvolver "Reforma de verdade"');
  await s.agora(); clearTimeout(s.timer);
  assert.equal(s.status, 'salvo');
  const t = r.files.get(f);
  assert.ok(t.includes('pedido: desenvolver'), t);
  assert.ok(t.includes('Linha nova do Claude.'), 'mudança remota preservada');
  assert.equal(s.texto(f), t);
});

test('Store: criar direção (PUT sem sha) e mapa-geral.json', async () => {
  const r = repoFalso(inicial); const s = new Store(novo(r)); await s.carregar();
  const f = 'ideias/youtube/quadro/direcoes/live/direcao.md';
  s.criar(f, '---\ntitulo: Live\nordem: 4\n---\n\n## Bruto\n\n### Anotações\n\n## Lapidado\n', 'App: cria a direção "Live" em "Quadro"');
  s.gravarMapa({ youtube: [10, -20] }, 'App: move áreas no mapa geral');
  await s.agora(); clearTimeout(s.timer);
  assert.ok(r.files.get(f).startsWith('---\ntitulo: Live\n'));
  assert.deepEqual(JSON.parse(r.files.get('ideias/mapa-geral.json')), { areas: { youtube: [10, -20] } });
  const puts = r.log.filter(l => l.method === 'PUT').map(l => JSON.parse(l.body));
  assert.ok(puts.every(p => !p.sha));
  assert.equal(s.model.ideias[0].direcoes.length, 2);
});

test('Store: sem conexão guarda na fila e mostra "offline"', async () => {
  const r = repoFalso(inicial);
  let caiu = true;
  const b = new GitHubBackend({ owner: 'dono', repo: 'brainstorm', token: TOKEN, fetch: (...a) => caiu && a[1] && a[1].method === 'PUT' ? Promise.reject(new TypeError('Failed to fetch')) : r.fetch(...a) });
  const s = new Store(b); await s.carregar();
  const f = 'ideias/youtube/quadro/ideia.md';
  s.remendar(f, { fm: { estado: 'guardada' } }, 'App: guarda a ideia "Quadro" na gaveta');
  await s.agora();
  assert.equal(s.status, 'offline'); assert.equal(s.pend.size, 1);
  caiu = false; await s.agora(); clearTimeout(s.timer); clearTimeout(s.retry);
  assert.equal(s.status, 'salvo');
  assert.ok(r.files.get(f).includes('estado: guardada'));
});

test('Edição por item: carrega item.md, cria o item (PUT sem sha) e o pedido de ferramenta vai na mensagem', async () => {
  const ITEM = '---\ntitulo: Reforma de verdade\norigem: direcoes/reforma\nestado: edicao\ncriado: 2026-10-27\n---\n\n## Contexto\n\n## Perguntas\n\n## Variáveis\n\n### Decididas\n- Formato:\n';
  const r = repoFalso(Object.assign({ 'ideias/youtube/quadro/decididas/velho/item.md': ITEM }, inicial));
  const s = new Store(novo(r)); await s.carregar();
  assert.ok(s.files.has('ideias/youtube/quadro/decididas/velho/item.md'));
  assert.equal(s.model.itens.length, 1);
  assert.equal(s.model.itens[0].no, s.model.ideias[0].direcoes[0]);
  const f = 'ideias/youtube/quadro/decididas/reforma/item.md';
  s.criar(f, ITEM, 'App: decide "Reforma de verdade" e manda para a Edição');
  s.remendar(f, { fm: { pedido: 'perguntas' } }, 'App: pede ao Claude "Gerar perguntas" em "Reforma de verdade"');
  s.remendar(f, { sec: { 'Variáveis/Decididas': '- Formato: Reel' } }, 'App: variáveis de "Reforma de verdade"');
  await s.agora(); clearTimeout(s.timer);
  const put = r.log.filter(l => l.method === 'PUT');
  assert.equal(put.length, 1);
  const body = JSON.parse(put[0].body);
  assert.equal(body.sha, undefined);
  assert.match(body.message, /^App: pede ao Claude "Gerar perguntas"/);
  assert.match(r.files.get(f), /^pedido: perguntas$/m);
  assert.match(r.files.get(f), /### Decididas\n- Formato: Reel/);
});
