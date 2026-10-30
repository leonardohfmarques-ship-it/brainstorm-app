// Guarda os arquivos em memória, aplica as mudanças na hora (otimista) e manda para o backend
// numa fila serial com espera de 800 ms. Conflito: busca o arquivo de novo e reaplica só o que mudou.
import { aplicar as aplicarMd, juntar as juntarMd } from './formato.js';
import { construir } from './modelo.js';

export const MAPA = 'ideias/mapa-geral.json';
const ESPERA = 800;

function aplicar(path, text, patch) {
  if (patch && patch.areas) {
    let o = {};
    try { o = text ? JSON.parse(text) : {}; } catch (e) { o = {}; }
    if (!o || typeof o !== 'object') o = {};
    o.areas = Object.assign({}, o.areas, patch.areas);
    return JSON.stringify(o, null, 2) + '\n';
  }
  return aplicarMd(text, patch);
}
function juntar(a, b) {
  if ((a && a.areas) || (b && b.areas)) return { areas: Object.assign({}, a && a.areas, b && b.areas) };
  return juntarMd(a, b);
}
// várias mudanças num envio só: a mensagem é a última, salvo se houver um pedido ao Claude no meio (a automação
// das ferramentas da Edição só acorda com "pede ao Claude" na mensagem, então ele vai na frente)
export function mensagem(msgs) {
  const u = [...new Set(msgs)];
  const pede = u.filter(m => /pede ao Claude/.test(m)).pop();
  const prim = pede || u[u.length - 1];
  return u.length === 1 ? u[0] : `${prim} (e mais ${u.length - 1})`;
}

// os arquivos de antes e os de agora têm os mesmos caminhos e os mesmos textos?
export function mesmosTextos(antes, agora) {
  if (!antes || !agora || antes.size !== agora.size) return false;
  for (const [p, f] of agora) { const a = antes.get(p); if (!a || a.text !== f.text) return false; }
  return true;
}
const chaves = m => m instanceof Map ? [...m.keys()] : Array.isArray(m) ? m.map(x => typeof x === 'string' ? x : JSON.stringify(x)) : Object.keys(m || {});
const mesmasChaves = (a, b) => { const x = chaves(a).sort().join('\n'), y = chaves(b).sort().join('\n'); return x === y; };

export class Store {
  constructor(backend) {
    this.b = backend;
    this.files = new Map();   // path -> { text (local), remoto, sha }
    this.pend = new Map();    // path -> { patch, criar, inicial, msgs }
    this.anexos = []; this.mapa = {}; this.rev = null;
    this.status = 'salvo'; this.erro = null;
    this.voando = false; this.timer = 0; this.retry = 0;
    this.ouvintes = new Set();
    this.ocultos = new Set(); // pastas que somem da tela enquanto o "Desfazer" está valendo
    this.model = { ideias: [], erros: [], porBase: new Map() };
  }
  on(fn) { this.ouvintes.add(fn); return () => this.ouvintes.delete(fn); }
  emit(tipo, extra) { this.ouvintes.forEach(fn => { try { fn(tipo, extra); } catch (e) { setTimeout(() => { throw e; }); } }); }
  setStatus(s, erro = null) { this.status = s; this.erro = erro; this.emit('status'); }
  get ocupado() { return this.pend.size > 0 || this.voando; }

  async carregar() {
    const r = await this.b.load();
    this.files = new Map([...r.files].map(([p, f]) => [p, { text: f.text, remoto: f.text, sha: f.sha }]));
    this.anexos = r.anexos; this.rev = r.rev; this.truncado = r.truncado;
    this.reconstruir();
  }
  oculto(p) { for (const b of this.ocultos) if (p.startsWith(b + '/')) return true; return false; }
  reconstruir() {
    const m = new Map([...this.files].filter(([p]) => !this.oculto(p)).map(([p, f]) => [p, { text: f.text }]));
    this.model = construir(m, this.anexos.filter(a => !this.oculto(a.path)));
    let mapa = {};
    const f = this.files.get(MAPA);
    if (f) { try { mapa = JSON.parse(f.text) || {}; } catch (e) { mapa = {}; } }
    this.mapa = mapa;
  }
  texto(path) { const f = this.files.get(path); return f ? f.text : null; }

  // busca de novo o que o Claude mudou (só quando não há nada nosso esperando)
  async atualizar() {
    if (this.ocupado) return false;
    const r = await this.b.load();
    if (this.ocupado || r.rev === this.rev) return false;
    // a revisão muda com qualquer commit (o vigia, o nosso próprio envio); só redesenha se algum texto mudou de fato
    const igual = mesmosTextos(this.files, r.files) && mesmasChaves(this.anexos, r.anexos);
    this.files = new Map([...r.files].map(([p, f]) => [p, { text: f.text, remoto: f.text, sha: f.sha }]));
    this.anexos = r.anexos; this.rev = r.rev;
    if (igual) return false;
    this.reconstruir(); this.emit('remoto');
    return true;
  }

  remendar(path, patch, msg) {
    const f = this.files.get(path); if (!f) return;
    f.text = aplicar(path, f.text, patch);
    const cur = this.pend.get(path);
    this.pend.set(path, cur ? Object.assign(cur, { patch: juntar(cur.patch, patch), msgs: cur.msgs.concat(msg) }) : { patch, criar: false, msgs: [msg] });
    this.reconstruir(); this.agendar();
  }
  gravarMapa(areas, msg) {
    if (!this.files.has(MAPA)) { this.files.set(MAPA, { text: '{}\n', remoto: null, sha: null }); this.pend.set(MAPA, { patch: { areas: {} }, criar: true, inicial: '{}\n', msgs: [] }); }
    this.remendar(MAPA, { areas }, msg);
  }
  criar(path, text, msg) {
    this.files.set(path, { text, remoto: null, sha: null });
    this.pend.set(path, { patch: { fm: {}, sec: {} }, criar: true, inicial: text, msgs: [msg] });
    this.reconstruir(); this.agendar();
  }

  // apagar em dois tempos: ocultar (some na hora, dá para desfazer) e depois apagarPasta (vai para o GitHub)
  ocultar(base) { this.ocultos.add(base); this.reconstruir(); }
  mostrar(base) { this.ocultos.delete(base); this.reconstruir(); }
  apagarPasta(base, msg) {
    this.ocultos.delete(base);
    const dentro = p => p.startsWith(base + '/');
    for (const p of [...this.files.keys()]) if (dentro(p)) this.files.delete(p);
    for (const p of [...this.pend.keys()]) if (dentro(p)) this.pend.delete(p);
    this.anexos = this.anexos.filter(a => !dentro(a.path));
    this.pend.set('apagar:' + base, { apagar: base, patch: null, msgs: [msg] });
    this.reconstruir(); this.agendar();
  }

  agendar(ms = ESPERA) {
    clearTimeout(this.timer);
    if (this.status !== 'erro' && this.status !== 'offline') this.setStatus('salvando');
    this.timer = setTimeout(() => this.descarregar(), ms);
  }
  // força o envio já (ex.: botão de tentar de novo)
  agora() { clearTimeout(this.timer); clearTimeout(this.retry); return this.descarregar(); }

  async descarregar() {
    if (this.voando || !this.pend.size) { if (!this.pend.size && !this.voando && this.status === 'salvando') this.setStatus('salvo'); return; }
    this.voando = true; this.setStatus('salvando');
    let falha = null;
    while (this.pend.size) {
      const [path, job] = this.pend.entries().next().value;
      this.pend.delete(path);
      try { await this.enviar(path, job); }
      catch (e) {
        // volta para a fila (a mudança mais nova por cima), salvo se o arquivo sumiu
        if (e.tipo !== 'naoexiste') {
          const cur = this.pend.get(path);
          this.pend.delete(path);
          this.pend.set(path, cur && !job.apagar ? { patch: juntar(job.patch, cur.patch), criar: job.criar || cur.criar, inicial: job.inicial || cur.inicial, msgs: job.msgs.concat(cur.msgs) } : job);
        }
        falha = e; break;
      }
    }
    this.voando = false;
    if (falha) {
      if (falha.tipo === 'rede') { this.setStatus('offline', falha); clearTimeout(this.retry); this.retry = setTimeout(() => this.descarregar(), 10000); }
      else this.setStatus('erro', falha);
      return;
    }
    if (this.pend.size) this.agendar(0); else this.setStatus('salvo');
  }

  async enviar(path, job) {
    if (job.apagar) { await this.b.apagar(job.apagar, mensagem(job.msgs)); return; }
    const f = this.files.get(path); if (!f) return;
    const msg = mensagem(job.msgs.length ? job.msgs : ['App: atualiza ' + path]);
    for (let t = 0; t < 3; t++) {
      const criando = job.criar && f.sha == null;
      const base = criando ? (job.inicial ?? '') : f.remoto;
      const text = aplicar(path, base, job.patch);
      if (!criando && text === f.remoto) return; // nada mudou de fato
      try {
        const r = await this.b.gravar(path, text, criando ? null : f.sha, msg);
        f.remoto = text; f.sha = r.sha;
        const resto = this.pend.get(path);
        f.text = resto ? aplicar(path, text, resto.patch) : text;
        return;
      } catch (e) {
        if (e.tipo !== 'conflito') throw e;
        const fresh = await this.b.ler(path);
        if (!fresh) {
          if (criando) continue;
          const err = new Error('O arquivo saiu do lugar no GitHub (o Claude pode ter mexido nele). Recarrega a página.'); err.tipo = 'naoexiste'; throw err;
        }
        f.remoto = fresh.text; f.sha = fresh.sha;
        job.criar = false;
        const resto = this.pend.get(path);
        f.text = aplicar(path, aplicar(path, fresh.text, job.patch), resto ? resto.patch : null);
        this.reconstruir(); this.emit('remoto-arquivo', path);
      }
    }
    const err = new Error('O arquivo mudou várias vezes seguidas no GitHub. Tenta de novo.'); err.tipo = 'conflito'; throw err;
  }
}
