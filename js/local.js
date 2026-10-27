// Backend de desenvolvimento (?local=1): lê os arquivos servidos pelo dev-server (/dados/ = pasta BRAINSTORM)
// e grava só neste navegador (localStorage). Nunca escreve nos arquivos de verdade.
import { ErroAPI } from './github.js';

const OVERLAY = 'bs-local-overlay';
const APAGADOS = 'bs-local-apagados'; // pastas apagadas neste navegador
function lerOverlay() { try { return JSON.parse(localStorage.getItem(OVERLAY) || '{}') || {}; } catch (e) { return {}; } }
function gravarOverlay(o) { try { localStorage.setItem(OVERLAY, JSON.stringify(o)); } catch (e) { /* sem armazenamento: fica só na memória */ } }

export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return 'local-' + (h >>> 0).toString(16);
}
function lerApagados() { try { const v = JSON.parse(localStorage.getItem(APAGADOS) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function gravarApagados(a) { try { localStorage.setItem(APAGADOS, JSON.stringify(a)); } catch (e) { /* só na memória */ } }
const caminho = p => p.split('/').map(encodeURIComponent).join('/');
const espera = ms => new Promise(r => setTimeout(r, ms));

export class LocalBackend {
  constructor({ base = './dados/', atraso = 220 } = {}) {
    this.kind = 'local';
    this.base = base.endsWith('/') ? base : base + '/';
    this.atraso = atraso;
    this.overlay = lerOverlay();
    this.apagados = lerApagados();
    this.indice = new Map();
    this.commits = [];
  }
  async testar() { return true; }
  apagado(p) { return this.apagados.some(b => p.startsWith(b + '/')); }

  async listar(dir) {
    let res;
    try { res = await fetch(this.base + caminho(dir), { cache: 'no-store' }); }
    catch (e) { throw new ErroAPI('rede', 'O servidor local não respondeu.'); }
    if (res.status === 404) return [];
    if (!res.ok) throw new ErroAPI('outro', `Servidor local: erro ${res.status}.`, res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    doc.querySelectorAll('a[href]').forEach(a => {
      const h = a.getAttribute('href');
      if (!h || h.startsWith('?') || h.startsWith('/') || h.startsWith('..') || /^[a-z]+:/i.test(h)) return;
      const nome = decodeURIComponent(h);
      if (nome === '.DS_Store' || nome.startsWith('.')) return;
      out.push(nome);
    });
    const subs = out.filter(n => n.endsWith('/'));
    const arqs = out.filter(n => !n.endsWith('/')).map(n => dir + n);
    const dentro = await Promise.all(subs.map(s => this.listar(dir + s)));
    return arqs.concat(...dentro);
  }

  async load() {
    await espera(this.atraso);
    const todos = await this.listar('ideias/');
    const ehTexto = p => /(^|\/)(ideia|direcao)\.md$/.test(p) || p === 'ideias/mapa-geral.json';
    const files = new Map();
    await Promise.all(todos.filter(p => ehTexto(p) && !this.apagado(p)).map(async p => {
      const r = await fetch(this.base + caminho(p), { cache: 'no-store' });
      const text = await r.text();
      files.set(p, { text, sha: hash(text) });
    }));
    // o que foi gravado neste navegador passa por cima
    for (const [p, text] of Object.entries(this.overlay)) if (!this.apagado(p)) files.set(p, { text, sha: hash(text) });
    const anexos = todos.filter(p => !ehTexto(p) && p.includes('/anexos/') && !this.apagado(p)).map(p => ({ path: p, sha: hash(p), size: 0 }));
    this.indice = new Map(anexos.map(a => [a.path, a]));
    let mapa = null;
    if (files.has('ideias/mapa-geral.json')) { try { mapa = JSON.parse(files.get('ideias/mapa-geral.json').text); } catch (e) { mapa = null; } }
    const rev = hash([...files.values()].map(f => f.sha).sort().join());
    return { files, anexos, mapa, rev, truncado: false };
  }

  async revisao() { return null; }

  async ler(path) {
    if (this.apagado(path)) return null;
    if (this.overlay[path] != null) return { text: this.overlay[path], sha: hash(this.overlay[path]) };
    const r = await fetch(this.base + caminho(path), { cache: 'no-store' });
    if (r.status === 404) return null;
    const text = await r.text();
    return { text, sha: hash(text) };
  }

  async gravar(path, text, sha, message) {
    await espera(this.atraso);
    this.overlay[path] = text; gravarOverlay(this.overlay);
    this.commits.push({ path, message, sha: hash(text), quando: Date.now() });
    return { sha: hash(text) };
  }

  // apaga a pasta só neste navegador: os arquivos de verdade não mudam
  async apagar(base, message) {
    await espera(this.atraso);
    const b = String(base).replace(/\/+$/, '');
    if (!this.apagados.includes(b)) this.apagados.push(b);
    gravarApagados(this.apagados);
    let n = 0;
    for (const p of Object.keys(this.overlay)) if (p.startsWith(b + '/')) { delete this.overlay[p]; n++; }
    gravarOverlay(this.overlay);
    for (const p of [...this.indice.keys()]) if (p.startsWith(b + '/')) { this.indice.delete(p); n++; }
    this.commits.push({ path: b, message, apagou: true, quando: Date.now() });
    return { apagados: n };
  }

  async anexoURL(path) { return this.base + caminho(path); }
  anexoHref(path) { return this.base + caminho(path); }
  descartar() { this.overlay = {}; this.apagados = []; try { localStorage.removeItem(OVERLAY); localStorage.removeItem(APAGADOS); } catch (e) { /* nada */ } }
}
