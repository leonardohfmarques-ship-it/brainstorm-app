// Worker "Entrar com GitHub" do BRAINSTORM (Cloudflare). Três rotas:
//   GET  /entrar?volta=<url do app>  → manda para a tela de autorizar do GitHub (state num cookie curto)
//   GET  /callback?code&state        → confere o state, troca o code por token e devolve ao app no fragmento (#)
//   POST /renovar {refresh_token}    → token novo (CORS só para o app)
// O client secret só existe aqui (secret do Worker). Nada de token em log.

const GH_AUTORIZAR = 'https://github.com/login/oauth/authorize';
const GH_TOKEN = 'https://github.com/login/oauth/access_token';
const COOKIE = 'bs_estado';

// endereços para onde o Worker aceita devolver: APP_URL e, se ligado, DEV_URL
export function permitidos(env) {
  return [env.APP_URL, env.DEV_URL].filter(Boolean).map(u => { try { return new URL(u); } catch (e) { return null; } }).filter(Boolean);
}
// volta só é aceita se tiver a mesma origem e começar pelo caminho de um endereço permitido; sai sem ?query nem #
export function voltaPermitida(volta, env) {
  let u; try { u = new URL(volta); } catch (e) { return null; }
  for (const p of permitidos(env)) {
    if (u.origin === p.origin && u.pathname.startsWith(p.pathname)) return u.origin + u.pathname;
  }
  return null;
}
function origemPermitida(origin, env) {
  return !!origin && permitidos(env).some(p => p.origin === origin);
}

function aleatorio(n = 24) {
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function lerCookie(req, nome) {
  const c = req.headers.get('Cookie') || '';
  for (const parte of c.split(/;\s*/)) { const i = parte.indexOf('='); if (i > 0 && parte.slice(0, i) === nome) return parte.slice(i + 1); }
  return '';
}
const cookie = (valor, idade) => `${COOKIE}=${valor}; Max-Age=${idade}; Path=/; HttpOnly; Secure; SameSite=Lax`;

const SEG = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
function pagina(status, titulo, texto, env, extra) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const link = env && env.APP_URL ? `<p><a href="${esc(env.APP_URL)}">Voltar ao BRAINSTORM</a></p>` : '';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titulo)}</title>`
    + `<style>body{font:16px/1.5 system-ui,sans-serif;background:#FAFAF7;color:#111;margin:0;padding:48px 16px}main{max-width:520px;margin:auto}h1{font-size:24px}a{color:#111}</style>`
    + `</head><body><main><h1>${esc(titulo)}</h1><p>${esc(texto)}</p>${link}</main></body></html>`;
  return new Response(html, { status, headers: { ...SEG, 'Content-Type': 'text/html; charset=utf-8', ...extra } });
}
function json(status, corpo, extra) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...SEG, 'Content-Type': 'application/json', ...extra } });
}
const configurado = env => !!(env.GITHUB_CLIENT_ID && !/^COLOCAR/.test(env.GITHUB_CLIENT_ID) && env.GITHUB_CLIENT_SECRET);

// pede ao GitHub: code → token, ou refresh_token → token
async function pedirToken(env, campos, f) {
  let res;
  try {
    res = await f(GH_TOKEN, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'brainstorm-entrar' },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, ...campos })
    });
  } catch (e) { return { erro: 'rede' }; }
  let d = null; try { d = await res.json(); } catch (e) { d = null; }
  if (!res.ok || !d) return { erro: 'github_' + res.status };
  if (d.error || !d.access_token) return { erro: d.error || 'sem_token' };
  return { token: d.access_token, refresh: d.refresh_token || '', vence: d.expires_in || 0, refresh_vence: d.refresh_token_expires_in || 0 };
}

async function entrar(req, env) {
  const url = new URL(req.url);
  const volta = voltaPermitida(url.searchParams.get('volta') || env.APP_URL || '', env);
  if (!volta) return pagina(400, 'Endereço não permitido', 'Este Worker só devolve para o app BRAINSTORM.', env);
  if (!configurado(env)) return pagina(503, 'Falta configurar', 'O GitHub App ainda não foi ligado a este Worker (client ID ou client secret).', env);
  const state = aleatorio();
  const destino = new URL(GH_AUTORIZAR);
  destino.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  destino.searchParams.set('redirect_uri', url.origin + '/callback');
  destino.searchParams.set('state', state);
  return new Response(null, { status: 302, headers: { ...SEG, 'Location': destino.toString(), 'Set-Cookie': cookie(`${state}.${encodeURIComponent(volta)}`, 600) } });
}

async function callback(req, env, f) {
  const url = new URL(req.url);
  const bruto = lerCookie(req, COOKIE) || '';
  const ponto = bruto.indexOf('.'); // "<state>.<volta codificada>" (o state é hexadecimal, sem ponto)
  const salvo = ponto > 0 ? bruto.slice(0, ponto) : '', voltaCod = ponto > 0 ? bruto.slice(ponto + 1) : '';
  const apagar = { 'Set-Cookie': cookie('', 0) };
  const state = url.searchParams.get('state') || '';
  if (!salvo || !iguais(salvo, state)) {
    return pagina(400, 'Entrada recusada', 'O pedido de entrada não confere (expirou ou veio de outro lugar). Volta ao app e clica de novo em "Entrar com GitHub".', env, apagar);
  }
  let volta = null; try { volta = voltaPermitida(decodeURIComponent(voltaCod || ''), env); } catch (e) { volta = null; }
  if (!volta) return pagina(400, 'Endereço não permitido', 'Este Worker só devolve para o app BRAINSTORM.', env, apagar);
  const ir = frag => new Response(null, { status: 302, headers: { ...SEG, 'Location': volta + '#' + frag, ...apagar } });
  if (url.searchParams.get('error')) return ir('bs_erro=' + encodeURIComponent(url.searchParams.get('error')));
  const code = url.searchParams.get('code');
  if (!code) return ir('bs_erro=sem_code');
  const r = await pedirToken(env, { code, redirect_uri: url.origin + '/callback' }, f);
  if (r.erro) return ir('bs_erro=' + encodeURIComponent(r.erro));
  const p = new URLSearchParams({ bs_token: r.token, bs_refresh: r.refresh, bs_vence: String(r.vence), bs_refresh_vence: String(r.refresh_vence) });
  return ir(p.toString());
}

async function renovar(req, env, f) {
  const origin = req.headers.get('Origin') || '';
  if (!origemPermitida(origin, env)) return json(403, { erro: 'origem' });
  const cors = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
  }
  if (req.method !== 'POST') return json(405, { erro: 'metodo' }, cors);
  if (!configurado(env)) return json(503, { erro: 'nao_configurado' }, cors);
  let corpo = null; try { corpo = await req.json(); } catch (e) { corpo = null; }
  const refresh = corpo && typeof corpo.refresh_token === 'string' ? corpo.refresh_token : '';
  if (!refresh) return json(400, { erro: 'sem_refresh' }, cors);
  const r = await pedirToken(env, { grant_type: 'refresh_token', refresh_token: refresh }, f);
  if (r.erro === 'rede' || /^github_5/.test(r.erro || '')) return json(502, { erro: 'github_fora' }, cors);
  if (r.erro) return json(401, { erro: 'refresh_invalido' }, cors);
  return json(200, r, cors);
}

export async function tratar(req, env, f = (...a) => fetch(...a)) {
  const { pathname } = new URL(req.url);
  if (pathname === '/entrar' && req.method === 'GET') return entrar(req, env);
  if (pathname === '/callback' && req.method === 'GET') return callback(req, env, f);
  if (pathname === '/renovar') return renovar(req, env, f);
  return pagina(404, 'Não encontrado', 'Este endereço só serve para entrar no BRAINSTORM.', env);
}

export default { fetch: (req, env) => tratar(req, env) };
