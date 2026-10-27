// Backend de produção: lê e grava no repositório privado pela API do GitHub.
// A chave (token) só vai para api.github.com, nunca para outro lugar, e nunca aparece em log.

const API = 'https://api.github.com';

export class ErroAPI extends Error {
  constructor(tipo, msg, status) { super(msg); this.tipo = tipo; this.status = status || 0; }
}

// base64 <-> UTF-8 sem perder acento
export function paraB64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function deB64(b64) {
  return new TextDecoder().decode(bytesDeB64(b64));
}
function bytesDeB64(b64) {
  const bin = atob(String(b64).replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const caminho = p => p.split('/').map(encodeURIComponent).join('/');

const TIPOS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', heic: 'image/heic', pdf: 'application/pdf', md: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8', mp4: 'video/mp4', mov: 'video/quicktime', m4a: 'audio/mp4', mp3: 'audio/mpeg' };
export const tipoDe = p => TIPOS[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

// cache de textos por sha (o mesmo sha é sempre o mesmo conteúdo)
const CACHE_KEY = 'bs-cache';
function lerCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { return {}; } }
function gravarCache(c) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* cheio ou bloqueado: segue sem cache */ } }

async function emParalelo(itens, limite, fn) {
  const out = new Array(itens.length); let i = 0;
  const trab = async () => { while (i < itens.length) { const k = i++; out[k] = await fn(itens[k], k); } };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trab));
  return out;
}

export class GitHubBackend {
  // token: chave colada (fixa). sessao: entrada com GitHub (renova sozinha; ver sessao.js)
  constructor({ owner, repo, branch = 'main', token, sessao, fetch: f } = {}) {
    this.kind = 'github';
    this.owner = owner; this.repo = repo; this.branch = branch;
    this.token = token;
    this.sessao = sessao || null;
    this._fetch = f || ((...a) => globalThis.fetch(...a));
    this.indice = new Map(); // path -> { sha, size }
    this.urls = new Map();   // sha -> object URL
    this.rev = null;
  }

  async pedir(path, opts, token) {
    try {
      return await this._fetch(API + path, {
        method: opts.method || 'GET',
        cache: 'no-store',
        headers: Object.assign({
          'Accept': 'application/vnd.github+json',
          'Authorization': 'Bearer ' + token,
          'X-GitHub-Api-Version': '2022-11-28'
        }, opts.body ? { 'Content-Type': 'application/json' } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) {
      throw new ErroAPI('rede', 'Sem conexão com o GitHub.');
    }
  }

  async api(path, opts = {}) {
    const ses = this.sessao;
    const token = ses ? await ses.tokenValido() : this.token;
    let res = await this.pedir(path, opts, token);
    // entrada com GitHub: 401 = token vencido ou girado → renova uma vez e repete o pedido
    if (res.status === 401 && ses && ses.podeRenovar()) res = await this.pedir(path, opts, await ses.renovar(token));
    if (res.ok) return res.status === 204 ? null : res.json();
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch (e) { /* corpo vazio */ }
    const s = res.status;
    if (s === 401) throw new ErroAPI('auth', 'O GitHub recusou a chave (vencida ou apagada).', s);
    if (s === 403 && /rate limit/i.test(msg)) throw new ErroAPI('limite', 'Limite de uso da API do GitHub. Tenta de novo em alguns minutos.', s);
    if (s === 403) throw new ErroAPI('perm', 'A chave não tem permissão de escrita (Contents: Read and write).', s);
    if (s === 404) throw new ErroAPI('naoexiste', 'Não encontrado no repositório.', s);
    if (s === 409 || (s === 422 && /sha/i.test(msg))) throw new ErroAPI('conflito', 'O arquivo mudou no GitHub.', s);
    throw new ErroAPI('outro', `Erro ${s} do GitHub${msg ? ': ' + msg : ''}.`, s);
  }

  get raiz() { return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`; }

  async testar() {
    try { await this.api(this.raiz); }
    catch (e) {
      if (e.tipo === 'naoexiste') throw new ErroAPI('naoexiste', `A chave não enxerga o repositório ${this.owner}/${this.repo}. Confere se ele foi escolhido em "Repository access".`);
      throw e;
    }
    return true;
  }

  async revisao() {
    const ref = await this.api(`${this.raiz}/git/ref/heads/${encodeURIComponent(this.branch)}`);
    return ref && ref.object ? ref.object.sha : null;
  }

  async load() {
    const tree = await this.api(`${this.raiz}/git/trees/${encodeURIComponent(this.branch)}?recursive=1`);
    const itens = (tree.tree || []).filter(t => t.type === 'blob' && t.path.startsWith('ideias/'));
    this.indice = new Map(itens.map(t => [t.path, { sha: t.sha, size: t.size }]));
    const ehTexto = p => /(^|\/)(ideia|direcao)\.md$/.test(p) || p === 'ideias/mapa-geral.json';
    const textos = itens.filter(t => ehTexto(t.path));
    const cache = lerCache(), usados = {};
    const files = new Map();
    await emParalelo(textos, 6, async t => {
      let text = cache[t.sha];
      if (text == null) {
        const b = await this.api(`${this.raiz}/git/blobs/${t.sha}`);
        text = deB64(b.content);
      }
      usados[t.sha] = text;
      files.set(t.path, { text, sha: t.sha });
    });
    gravarCache(usados);
    const anexos = itens.filter(t => !ehTexto(t.path) && t.path.includes('/anexos/')).map(t => ({ path: t.path, sha: t.sha, size: t.size }));
    let mapa = null;
    if (files.has('ideias/mapa-geral.json')) { try { mapa = JSON.parse(files.get('ideias/mapa-geral.json').text); } catch (e) { mapa = null; } }
    this.rev = tree.sha;
    return { files, anexos, mapa, rev: tree.sha, truncado: !!tree.truncated };
  }

  async ler(path) {
    try {
      const r = await this.api(`${this.raiz}/contents/${caminho(path)}?ref=${encodeURIComponent(this.branch)}`);
      return { text: deB64(r.content || ''), sha: r.sha };
    } catch (e) { if (e.tipo === 'naoexiste') return null; throw e; }
  }

  async gravar(path, text, sha, message) {
    const body = { message, content: paraB64(text), branch: this.branch };
    if (sha) body.sha = sha;
    const r = await this.api(`${this.raiz}/contents/${caminho(path)}`, { method: 'PUT', body });
    const novo = r && r.content ? r.content.sha : null;
    if (novo) this.indice.set(path, { sha: novo, size: text.length });
    return { sha: novo };
  }

  // apaga uma pasta inteira (direção, direções dentro, anexos) num commit só, pela Git Data API.
  // Lê a árvore na hora, então leva junto o que o Claude tenha criado lá dentro depois do carregamento.
  async apagar(base, message) {
    const pref = String(base).replace(/\/+$/, '') + '/';
    const ramo = encodeURIComponent(this.branch);
    for (let t = 0; t < 3; t++) {
      const ref = await this.api(`${this.raiz}/git/ref/heads/${ramo}`);
      const head = ref.object.sha;
      const commit = await this.api(`${this.raiz}/git/commits/${head}`);
      const tree = await this.api(`${this.raiz}/git/trees/${commit.tree.sha}?recursive=1`);
      if (tree.truncated) throw new ErroAPI('outro', 'O repositório ficou grande demais para apagar por aqui.');
      const alvos = (tree.tree || []).filter(i => i.type === 'blob' && i.path.startsWith(pref));
      if (!alvos.length) return { apagados: 0 };
      const nova = await this.api(`${this.raiz}/git/trees`, { method: 'POST', body: {
        base_tree: commit.tree.sha, tree: alvos.map(i => ({ path: i.path, mode: i.mode || '100644', type: 'blob', sha: null })) } });
      const c = await this.api(`${this.raiz}/git/commits`, { method: 'POST', body: { message, tree: nova.sha, parents: [head] } });
      try {
        await this.api(`${this.raiz}/git/refs/heads/${ramo}`, { method: 'PATCH', body: { sha: c.sha, force: false } });
      } catch (e) {
        if (e.status === 422 || e.tipo === 'conflito') continue; // alguém gravou no meio: refaz por cima do novo
        throw e;
      }
      for (const i of alvos) this.indice.delete(i.path);
      return { apagados: alvos.length };
    }
    throw new ErroAPI('conflito', 'O GitHub mudou várias vezes seguidas. Tenta de novo.');
  }

  // anexo: busca o blob pela API e devolve um object URL (repositório privado não tem link direto)
  async anexoURL(path) {
    const it = this.indice.get(path); if (!it) throw new ErroAPI('naoexiste', 'Anexo não encontrado.');
    if (this.urls.has(it.sha)) return this.urls.get(it.sha);
    const b = await this.api(`${this.raiz}/git/blobs/${it.sha}`);
    const url = URL.createObjectURL(new Blob([bytesDeB64(b.content)], { type: tipoDe(path) }));
    this.urls.set(it.sha, url);
    return url;
  }
  anexoHref(path) { return `https://github.com/${this.owner}/${this.repo}/blob/${encodeURIComponent(this.branch)}/${caminho(path)}`; }
}
