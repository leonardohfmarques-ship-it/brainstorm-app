// Worker "Entrar com GitHub" (worker/src/index.js) com um GitHub de mentira. Nenhum segredo real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tratar, voltaPermitida } from '../worker/src/index.js';

const BASE = 'https://brainstorm-entrar.exemplo.workers.dev';
const APP = 'https://dono.github.io/brainstorm-app/';
const env = { GITHUB_CLIENT_ID: 'Iv1.cliente', GITHUB_CLIENT_SECRET: 'segredo-de-teste', APP_URL: APP, DEV_URL: 'http://localhost:8773/' };

function github() {
  const log = [];
  const f = async (url, opts) => {
    const body = JSON.parse(opts.body);
    log.push({ url, body });
    assert.equal(url, 'https://github.com/login/oauth/access_token');
    const ok = d => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (body.code === 'code-bom') return ok({ access_token: 'ghu_novo', expires_in: 28800, refresh_token: 'ghr_novo', refresh_token_expires_in: 15897600, token_type: 'bearer', scope: '' });
    if (body.grant_type === 'refresh_token' && body.refresh_token === 'ghr_bom') return ok({ access_token: 'ghu_renovado', expires_in: 28800, refresh_token: 'ghr_girado', refresh_token_expires_in: 15897600 });
    return ok({ error: body.grant_type ? 'bad_refresh_token' : 'bad_verification_code' });
  };
  return { f, log };
}
const pedido = (caminho, init = {}) => new Request(BASE + caminho, init);
const cookieDe = res => (res.headers.get('Set-Cookie') || '').split(';')[0];

test('/entrar: manda para o GitHub com client_id, state e cookie curto HttpOnly/Secure/SameSite=Lax', async () => {
  const res = await tratar(pedido('/entrar?volta=' + encodeURIComponent(APP)), env, github().f);
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get('Location'));
  assert.equal(loc.origin + loc.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(loc.searchParams.get('client_id'), 'Iv1.cliente');
  assert.equal(loc.searchParams.get('redirect_uri'), BASE + '/callback');
  const state = loc.searchParams.get('state');
  assert.match(state, /^[0-9a-f]{48}$/);
  const sc = res.headers.get('Set-Cookie');
  assert.ok(sc.startsWith('bs_estado=' + state + '.'));
  for (const p of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=600']) assert.ok(sc.includes(p), p);
  assert.ok(!res.headers.get('Location').includes('segredo'), 'segredo nunca sai do Worker');
});

test('origem não permitida: recusa em /entrar e em /renovar', async () => {
  const r1 = await tratar(pedido('/entrar?volta=' + encodeURIComponent('https://malvado.exemplo/')), env, github().f);
  assert.equal(r1.status, 400);
  assert.equal(r1.headers.get('Location'), null);
  const r2 = await tratar(pedido('/entrar?volta=' + encodeURIComponent('https://dono.github.io/outro-site/')), env, github().f);
  assert.equal(r2.status, 400, 'mesma origem, caminho de outro site');
  const r3 = await tratar(pedido('/renovar', { method: 'POST', headers: { Origin: 'https://malvado.exemplo', 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: 'ghr_bom' }) }), env, github().f);
  assert.equal(r3.status, 403);
  assert.equal(r3.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(voltaPermitida('http://localhost:8773/?x=1#y', env), 'http://localhost:8773/', 'dev permitido, sem query nem fragmento');
  assert.equal(voltaPermitida('http://localhost:8773/', { ...env, DEV_URL: '' }), null, 'dev desligado');
  assert.equal(voltaPermitida('http://127.0.0.1:8773/', env), null);
});

test('state errado (ou sem cookie) recusa e não troca o code', async () => {
  const gh = github();
  const ini = await tratar(pedido('/entrar?volta=' + encodeURIComponent(APP)), env, gh.f);
  const ck = cookieDe(ini);
  const errado = await tratar(pedido('/callback?code=code-bom&state=' + 'f'.repeat(48), { headers: { Cookie: ck } }), env, gh.f);
  assert.equal(errado.status, 400);
  assert.equal(errado.headers.get('Location'), null);
  const semCookie = await tratar(pedido('/callback?code=code-bom&state=' + new URL(ini.headers.get('Location')).searchParams.get('state')), env, gh.f);
  assert.equal(semCookie.status, 400);
  assert.equal(gh.log.length, 0, 'GitHub nem foi chamado');
});

test('troca de code ok: volta ao app com token, refresh e validade no fragmento, e apaga o cookie', async () => {
  const gh = github();
  const ini = await tratar(pedido('/entrar?volta=' + encodeURIComponent(APP)), env, gh.f);
  const state = new URL(ini.headers.get('Location')).searchParams.get('state');
  const res = await tratar(pedido(`/callback?code=code-bom&state=${state}`, { headers: { Cookie: 'outro=1; ' + cookieDe(ini) } }), env, gh.f);
  assert.equal(res.status, 302);
  const loc = res.headers.get('Location');
  assert.ok(loc.startsWith(APP + '#'), loc);
  const frag = new URLSearchParams(loc.split('#')[1]);
  assert.equal(frag.get('bs_token'), 'ghu_novo');
  assert.equal(frag.get('bs_refresh'), 'ghr_novo');
  assert.equal(frag.get('bs_vence'), '28800');
  assert.equal(frag.get('bs_refresh_vence'), '15897600');
  assert.ok(!loc.split('#')[0].includes('ghu_'), 'token só no fragmento');
  assert.ok(res.headers.get('Set-Cookie').includes('Max-Age=0'));
  assert.equal(gh.log[0].body.client_secret, 'segredo-de-teste');
  assert.equal(gh.log[0].body.code, 'code-bom');
});

test('callback: code recusado ou usuário cancelou → volta ao app com bs_erro, sem token', async () => {
  for (const q of ['code=code-ruim', 'error=access_denied']) {
    const gh = github();
    const ini = await tratar(pedido('/entrar?volta=' + encodeURIComponent('http://localhost:8773/')), env, gh.f);
    const state = new URL(ini.headers.get('Location')).searchParams.get('state');
    const res = await tratar(pedido(`/callback?${q}&state=${state}`, { headers: { Cookie: cookieDe(ini) } }), env, gh.f);
    assert.equal(res.status, 302);
    assert.match(res.headers.get('Location'), /^http:\/\/localhost:8773\/#bs_erro=/);
  }
});

test('/renovar: CORS só para o app; refresh bom → token novo; ruim → 401', async () => {
  const gh = github();
  const pre = await tratar(pedido('/renovar', { method: 'OPTIONS', headers: { Origin: 'https://dono.github.io' } }), env, gh.f);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://dono.github.io');
  const post = body => tratar(pedido('/renovar', { method: 'POST', headers: { Origin: 'https://dono.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, gh.f);
  const ok = await post({ refresh_token: 'ghr_bom' });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://dono.github.io');
  assert.deepEqual(await ok.json(), { token: 'ghu_renovado', refresh: 'ghr_girado', vence: 28800, refresh_vence: 15897600 });
  assert.equal(gh.log[0].body.grant_type, 'refresh_token');
  const ruim = await post({ refresh_token: 'ghr_velho' });
  assert.equal(ruim.status, 401);
  assert.equal((await post({})).status, 400);
});

test('sem client ID/secret configurado: avisa em vez de mandar ao GitHub', async () => {
  const res = await tratar(pedido('/entrar?volta=' + encodeURIComponent(APP)), { ...env, GITHUB_CLIENT_ID: 'COLOCAR_O_CLIENT_ID' }, github().f);
  assert.equal(res.status, 503);
  const r2 = await tratar(pedido('/entrar?volta=' + encodeURIComponent(APP)), { ...env, GITHUB_CLIENT_SECRET: undefined }, github().f);
  assert.equal(r2.status, 503);
});
