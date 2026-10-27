// Entrada com GitHub (GitHub App + Worker). Guarda o token de 8 h e o refresh token só neste navegador,
// renova sozinho antes de vencer e quando o GitHub responde 401. Funções puras: recebem storage e fetch.
import { ErroAPI } from './github.js';

export const CHAVES = { token: 'bs-token', refresh: 'bs-refresh', vence: 'bs-vence', refreshVence: 'bs-refresh-vence' };
const MARGEM = 5 * 60 * 1000; // renova 5 min antes de vencer

const ler = (st, k) => { try { return st.getItem(k) || ''; } catch (e) { return ''; } };
const por = (st, k, v) => { try { st.setItem(k, String(v)); } catch (e) { /* sem armazenamento: vale só nesta aba */ } };
const tirar = (st, k) => { try { st.removeItem(k); } catch (e) { /* nada */ } };

// endereço do Worker, sem barra no fim; vazio = entrada com GitHub desligada (só a chave colada)
export function enderecoWorker(config) {
  const w = config && config.login && config.login.worker;
  return typeof w === 'string' ? w.trim().replace(/\/+$/, '') : '';
}

// link do botão "Entrar com GitHub": o Worker só aceita voltar para as origens que ele conhece
export function linkEntrar(worker, loc) {
  return `${worker}/entrar?volta=${encodeURIComponent(loc.origin + loc.pathname)}`;
}

// lê "#bs_token=...&bs_refresh=...&bs_vence=28800&bs_refresh_vence=15897600" (ou "#bs_erro=...")
export function lerFragmento(hash) {
  const h = String(hash || '').replace(/^#/, '');
  if (!/(^|&)bs_(token|erro)=/.test(h)) return null;
  const p = new URLSearchParams(h);
  if (p.get('bs_erro')) return { erro: p.get('bs_erro') };
  const token = p.get('bs_token') || '';
  if (!token) return { erro: 'sem_token' };
  const num = k => { const n = Number(p.get(k)); return Number.isFinite(n) && n > 0 ? n : 0; };
  return { token, refresh: p.get('bs_refresh') || '', vence: num('bs_vence'), refreshVence: num('bs_refresh_vence') };
}

// guarda o que veio no fragmento e limpa a URL (o token não fica no histórico nem na barra)
export function consumirFragmento({ location, history, storage, agora = Date.now }) {
  const f = lerFragmento(location.hash);
  if (!f) return null;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* nada */ }
  if (f.token) guardar(storage, f, agora());
  return f;
}

// vence e refreshVence chegam em segundos a partir de agora; aqui viram data absoluta (ms)
export function guardar(storage, { token, refresh, vence, refreshVence }, agora) {
  por(storage, CHAVES.token, token);
  if (refresh) por(storage, CHAVES.refresh, refresh); else tirar(storage, CHAVES.refresh);
  if (vence) por(storage, CHAVES.vence, agora + vence * 1000); else tirar(storage, CHAVES.vence);
  if (refreshVence) por(storage, CHAVES.refreshVence, agora + refreshVence * 1000); else tirar(storage, CHAVES.refreshVence);
}

export function esquecer(storage) { for (const k of Object.values(CHAVES)) tirar(storage, k); }

// como o app começa: local, sessão (GitHub com refresh), chave colada, ou tela de entrada
export function escolherInicio({ local, config, storage }) {
  if (local) return { tipo: 'local' };
  const worker = enderecoWorker(config);
  const token = ler(storage, CHAVES.token);
  if (!token) return { tipo: 'entrada', botao: !!worker };
  if (worker && ler(storage, CHAVES.refresh)) return { tipo: 'sessao', worker };
  return { tipo: 'chave', token };
}

export class Sessao {
  constructor({ worker, storage, fetch: f, agora = Date.now, locks } = {}) {
    this.worker = worker;
    this.st = storage;
    this._fetch = f || ((...a) => globalThis.fetch(...a));
    this.agora = agora;
    this.locks = locks === undefined ? (globalThis.navigator && globalThis.navigator.locks) || null : locks;
    this._renovando = null;
  }
  get token() { return ler(this.st, CHAVES.token); }
  get refresh() { return ler(this.st, CHAVES.refresh); }
  get vence() { return Number(ler(this.st, CHAVES.vence)) || 0; }
  podeRenovar() { return !!(this.worker && this.refresh); }
  vencendo() { const v = this.vence; return !!v && v - this.agora() < MARGEM; }
  vencido() { const v = this.vence; return !!v && v <= this.agora(); }

  // token pronto para usar: renova antes se estiver para vencer
  async tokenValido() {
    if (!this.token) throw new ErroAPI('auth', 'Sem entrada no GitHub.');
    if (!this.vencendo() || !this.podeRenovar()) return this.token;
    try { return await this.renovar(); }
    catch (e) { if (e.tipo === 'rede' && !this.vencido()) return this.token; throw e; }
  }

  // troca o refresh token por um token novo no Worker. Uma de cada vez (o refresh token só vale uma vez),
  // e entre abas pelo navigator.locks: se outra aba já renovou, usa o dela.
  // falhou = o token que o GitHub recusou (se já foi trocado por outro, usa o novo sem renovar de novo)
  renovar(falhou) {
    if (this._renovando) return this._renovando;
    const antigo = falhou || this.token;
    const fazer = async () => {
      if (this.token && this.token !== antigo && !this.vencendo()) return this.token;
      const refresh = this.refresh;
      if (!this.worker || !refresh) throw new ErroAPI('auth', 'A entrada no GitHub venceu.');
      let res;
      try {
        res = await this._fetch(this.worker + '/renovar', {
          method: 'POST', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh })
        });
      } catch (e) { throw new ErroAPI('rede', 'Sem conexão para renovar a entrada.'); }
      let d = null;
      try { d = await res.json(); } catch (e) { d = null; }
      if (res.ok && d && d.token) {
        guardar(this.st, { token: d.token, refresh: d.refresh || refresh, vence: d.vence, refreshVence: d.refresh_vence }, this.agora());
        return d.token;
      }
      if (res.status === 400 || res.status === 401) {
        // outra aba pode ter girado o refresh token no meio: confere antes de desistir
        if (this.refresh !== refresh && this.token !== antigo) return this.token;
        esquecer(this.st);
        throw new ErroAPI('auth', 'A entrada no GitHub venceu. Entra de novo.', 401);
      }
      throw new ErroAPI('outro', `Não deu para renovar a entrada (erro ${res.status}).`, res.status);
    };
    const p = this.locks ? this.locks.request('bs-renovar', fazer) : fazer();
    this._renovando = p.finally(() => { this._renovando = null; });
    return this._renovando;
  }

  sair() { esquecer(this.st); }
}
