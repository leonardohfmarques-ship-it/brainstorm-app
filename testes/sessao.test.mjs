// Entrada com GitHub no app: fragmento, renovação, 401 → renova → repete, e worker vazio = tudo como antes.
// Worker e GitHub de mentira; nenhum token real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sessao, CHAVES, lerFragmento, consumirFragmento, escolherInicio, enderecoWorker, linkEntrar, esquecer } from '../js/sessao.js';
import { GitHubBackend } from '../js/github.js';

const WORKER = 'https://entrar.exemplo.workers.dev';
const memoria = (inicial = {}) => {
  const m = new Map(Object.entries(inicial));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
};
const resposta = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// Worker + GitHub de mentira: o refresh token gira a cada renovação (só vale uma vez), como no GitHub
function mundo({ tokenAceito = 'tok-novo', refreshValido = 'ref-1', workerFora = false } = {}) {
  const st = { aceito: tokenAceito, refresh: refreshValido, renovacoes: 0, log: [] };
  const fetch = async (url, opts = {}) => {
    st.log.push({ url, method: opts.method || 'GET', auth: opts.headers && opts.headers.Authorization });
    if (url === WORKER + '/renovar') {
      if (workerFora) throw new TypeError('Failed to fetch');
      const { refresh_token } = JSON.parse(opts.body);
      if (refresh_token !== st.refresh) return resposta(401, { erro: 'refresh_invalido' });
      st.renovacoes++;
      st.refresh = 'ref-' + (st.renovacoes + 1);
      return resposta(200, { token: st.aceito, refresh: st.refresh, vence: 28800, refresh_vence: 15897600 });
    }
    assert.ok(url.startsWith('https://api.github.com/'), 'o token só vai para api.github.com: ' + url);
    if (opts.headers.Authorization !== 'Bearer ' + st.aceito) return resposta(401, { message: 'Bad credentials' });
    return resposta(200, { full_name: 'dono/brainstorm' });
  };
  return { st, fetch };
}

test('fragmento: lê token, refresh e validades; ignora o que não é da entrada', () => {
  assert.equal(lerFragmento(''), null);
  assert.equal(lerFragmento('#secao-2'), null);
  const f = lerFragmento('#bs_token=ghu_X&bs_refresh=ghr_Y&bs_vence=28800&bs_refresh_vence=15897600');
  assert.deepEqual(f, { token: 'ghu_X', refresh: 'ghr_Y', vence: 28800, refreshVence: 15897600 });
  assert.deepEqual(lerFragmento('#bs_erro=access_denied'), { erro: 'access_denied' });
});

test('fragmento: guarda no navegador e limpa a URL com history.replaceState', () => {
  const storage = memoria();
  const chamadas = [];
  const location = { hash: '#bs_token=ghu_X&bs_refresh=ghr_Y&bs_vence=28800&bs_refresh_vence=100', pathname: '/brainstorm-app/', search: '' };
  const history = { replaceState: (...a) => chamadas.push(a) };
  const f = consumirFragmento({ location, history, storage, agora: () => 1000 });
  assert.equal(f.token, 'ghu_X');
  assert.deepEqual(chamadas, [[null, '', '/brainstorm-app/']], 'URL sem o fragmento');
  assert.equal(storage.getItem(CHAVES.token), 'ghu_X');
  assert.equal(storage.getItem(CHAVES.refresh), 'ghr_Y');
  assert.equal(storage.getItem(CHAVES.vence), String(1000 + 28800 * 1000));
  assert.equal(storage.getItem(CHAVES.refreshVence), String(1000 + 100 * 1000));
  // erro também limpa a URL, sem guardar nada
  const s2 = memoria(); const h2 = [];
  const e = consumirFragmento({ location: { hash: '#bs_erro=access_denied', pathname: '/', search: '?x=1' }, history: { replaceState: (...a) => h2.push(a) }, storage: s2 });
  assert.equal(e.erro, 'access_denied');
  assert.deepEqual(h2, [[null, '', '/?x=1']]);
  assert.equal(s2.m.size, 0);
  // sem fragmento da entrada: não mexe na URL
  const h3 = [];
  assert.equal(consumirFragmento({ location: { hash: '', pathname: '/', search: '' }, history: { replaceState: (...a) => h3.push(a) }, storage: memoria() }), null);
  assert.equal(h3.length, 0);
});

test('renovação: token perto de vencer é trocado no Worker antes do pedido ao GitHub', async () => {
  const { st, fetch } = mundo();
  let agora = 1_000_000;
  const storage = memoria({ [CHAVES.token]: 'tok-velho', [CHAVES.refresh]: 'ref-1', [CHAVES.vence]: String(agora + 60_000) });
  const sessao = new Sessao({ worker: WORKER, storage, fetch, agora: () => agora, locks: null });
  const b = new GitHubBackend({ owner: 'dono', repo: 'brainstorm', sessao, fetch });
  await b.testar();
  assert.equal(st.renovacoes, 1);
  assert.equal(storage.getItem(CHAVES.token), 'tok-novo');
  assert.equal(storage.getItem(CHAVES.refresh), 'ref-2', 'refresh token girado');
  assert.equal(storage.getItem(CHAVES.vence), String(agora + 28800 * 1000));
  assert.deepEqual(st.log.map(l => l.url), [WORKER + '/renovar', 'https://api.github.com/repos/dono/brainstorm']);
  assert.equal(st.log[1].auth, 'Bearer tok-novo');
  // longe de vencer: não renova de novo
  await b.testar();
  assert.equal(st.renovacoes, 1);
});

test('401 → renova → repete o pedido (uma renovação só, mesmo com pedidos em paralelo)', async () => {
  const { st, fetch } = mundo();
  const agora = 5_000_000;
  const storage = memoria({ [CHAVES.token]: 'tok-girado', [CHAVES.refresh]: 'ref-1', [CHAVES.vence]: String(agora + 3600_000) });
  const sessao = new Sessao({ worker: WORKER, storage, fetch, agora: () => agora, locks: null });
  const b = new GitHubBackend({ owner: 'dono', repo: 'brainstorm', sessao, fetch });
  await Promise.all([b.testar(), b.testar(), b.testar()]);
  assert.equal(st.renovacoes, 1, 'o refresh token só vale uma vez: uma renovação para todos');
  const gh = st.log.filter(l => l.url.startsWith('https://api.github.com'));
  assert.equal(gh.filter(l => l.auth === 'Bearer tok-girado').length, 3);
  assert.equal(gh.filter(l => l.auth === 'Bearer tok-novo').length, 3, 'cada pedido repetido com o token novo');
  // um pedido que saiu com o token velho e volta 401 depois da renovação usa o novo sem renovar de novo
  assert.equal(await sessao.renovar('tok-girado'), 'tok-novo');
  assert.equal(st.renovacoes, 1);
});

test('renovação recusada: apaga tudo e o erro é "auth" (o app volta para a tela de entrada)', async () => {
  const { fetch } = mundo({ refreshValido: 'outro' });
  const storage = memoria({ [CHAVES.token]: 'tok-x', [CHAVES.refresh]: 'ref-1', [CHAVES.vence]: '99999999999999' });
  const sessao = new Sessao({ worker: WORKER, storage, fetch, locks: null });
  const b = new GitHubBackend({ owner: 'dono', repo: 'brainstorm', sessao, fetch });
  await assert.rejects(b.testar(), e => e.tipo === 'auth');
  assert.equal(storage.m.size, 0, 'token e refresh esquecidos');
});

test('Worker fora do ar com token ainda válido: segue com o token atual; ao vencer, erro de rede (não desloga)', async () => {
  const { fetch } = mundo({ tokenAceito: 'tok-atual', workerFora: true });
  let agora = 1_000_000;
  const storage = memoria({ [CHAVES.token]: 'tok-atual', [CHAVES.refresh]: 'ref-1', [CHAVES.vence]: String(agora + 60_000) });
  const sessao = new Sessao({ worker: WORKER, storage, fetch, agora: () => agora, locks: null });
  assert.equal(await sessao.tokenValido(), 'tok-atual');
  agora += 120_000;
  await assert.rejects(sessao.tokenValido(), e => e.tipo === 'rede');
  assert.equal(storage.getItem(CHAVES.refresh), 'ref-1', 'não esquece a entrada por falta de rede');
});

test('outra aba já renovou: usa o token dela em vez de gastar o refresh token de novo', async () => {
  const { st, fetch } = mundo();
  const storage = memoria({ [CHAVES.token]: 'tok-velho', [CHAVES.refresh]: 'ref-1', [CHAVES.vence]: '99999999999999' });
  const sessao = new Sessao({ worker: WORKER, storage, fetch, agora: () => 0, locks: {
    // simula o navigator.locks: enquanto esperava a vez, outra aba renovou e gravou no localStorage
    request: async (nome, fn) => { storage.setItem(CHAVES.token, 'tok-novo'); storage.setItem(CHAVES.refresh, 'ref-9'); return fn(); }
  } });
  assert.equal(await sessao.renovar(), 'tok-novo');
  assert.equal(st.renovacoes, 0);
});

test('worker vazio: tudo como antes (chave colada, sem botão, sem renovação)', async () => {
  const cfg = { owner: 'dono', repo: 'brainstorm', login: { worker: '' } };
  assert.equal(enderecoWorker(cfg), '');
  assert.equal(enderecoWorker({}), '', 'config antiga sem login também vale');
  assert.deepEqual(escolherInicio({ local: false, config: cfg, storage: memoria() }), { tipo: 'entrada', botao: false });
  assert.deepEqual(escolherInicio({ local: false, config: cfg, storage: memoria({ 'bs-token': 'github_pat_X' }) }), { tipo: 'chave', token: 'github_pat_X' });
  // mesmo com restos de uma entrada com GitHub, sem Worker não tenta renovar
  assert.deepEqual(escolherInicio({ local: false, config: cfg, storage: memoria({ 'bs-token': 't', 'bs-refresh': 'r' }) }), { tipo: 'chave', token: 't' });
  assert.deepEqual(escolherInicio({ local: true, config: cfg, storage: memoria() }), { tipo: 'local' });
  // chave colada recusada: erro "auth" direto, sem chamar Worker nenhum
  const log = [];
  const b = new GitHubBackend({ owner: 'dono', repo: 'brainstorm', token: 'github_pat_X', fetch: async (url, o) => { log.push(url); return resposta(401, { message: 'Bad credentials' }); } });
  await assert.rejects(b.testar(), e => e.tipo === 'auth');
  assert.deepEqual(log, ['https://api.github.com/repos/dono/brainstorm']);
});

test('worker ligado: botão aparece, sessão com refresh, link de entrada com a volta, sair apaga tudo', () => {
  const cfg = { login: { worker: WORKER + '/' } };
  assert.equal(enderecoWorker(cfg), WORKER);
  assert.deepEqual(escolherInicio({ local: false, config: cfg, storage: memoria() }), { tipo: 'entrada', botao: true });
  assert.deepEqual(escolherInicio({ local: false, config: cfg, storage: memoria({ 'bs-token': 't', 'bs-refresh': 'r' }) }), { tipo: 'sessao', worker: WORKER });
  assert.deepEqual(escolherInicio({ local: false, config: cfg, storage: memoria({ 'bs-token': 'github_pat_X' }) }), { tipo: 'chave', token: 'github_pat_X' }, 'chave colada continua valendo');
  assert.equal(linkEntrar(WORKER, { origin: 'https://dono.github.io', pathname: '/brainstorm-app/' }),
    WORKER + '/entrar?volta=' + encodeURIComponent('https://dono.github.io/brainstorm-app/'));
  const st = memoria({ 'bs-token': 't', 'bs-refresh': 'r', 'bs-vence': '1', 'bs-refresh-vence': '2', 'bs-ui': '{}' });
  esquecer(st);
  assert.deepEqual([...st.m.keys()], ['bs-ui']);
});
